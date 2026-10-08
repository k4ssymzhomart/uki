-- WP 1.3: assign_proctors through the API.
--
-- PostgREST sessions load pg-safeupdate (the authenticator role's session_preload_libraries), which
-- refuses a DELETE without a WHERE clause. assign_proctors (20261009000000_phase1.sql) empties its
-- scratch table with a bare `delete from pg_temp.uki_assign;`, so every call from the dashboard failed
-- with "DELETE requires a WHERE clause", while pgTAP, which runs outside PostgREST, passed. The function
-- below is the same with `where true` on that one statement. Its grants are unchanged.

create or replace function public.assign_proctors(exam_id uuid, rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_e public.exams;
  r record;
  v_prev_to int;
  v_leads int;
  v_staff uuid[];
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select e.* into v_e from public.exams e where e.id = assign_proctors.exam_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_staff_of(v_e.workspace_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if v_e.status not in ('draft', 'scheduled') then
    raise exception using message = 'not_editable', errcode = 'P0001';
  end if;
  if jsonb_typeof(assign_proctors.rows) is distinct from 'array' or jsonb_array_length(assign_proctors.rows) > 50 then
    raise exception using message = 'bad_request', detail = 'rows must hold 0 to 50 rows', errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.uki_assign (
    n int, staff_id uuid, seat_from int, seat_to int, languages public.locale[], is_lead boolean
  ) on commit drop;
  delete from pg_temp.uki_assign where true;

  for r in
    select x.value as v, x.n from jsonb_array_elements(assign_proctors.rows) with ordinality as x(value, n)
  loop
    if jsonb_typeof(r.v) <> 'object'
      or public.try_uuid(r.v ->> 'staff_id') is null
      or not public.json_number_between(r.v -> 'seat_from', 1, 100000, true)
      or not public.json_number_between(r.v -> 'seat_to', 1, 100000, true)
      or (r.v ->> 'seat_to')::int < (r.v ->> 'seat_from')::int
      or jsonb_typeof(r.v -> 'languages') <> 'array'
      or jsonb_array_length(r.v -> 'languages') not between 1 and 3
      or exists (select 1 from jsonb_array_elements_text(r.v -> 'languages') as l where l not in ('kk', 'ru', 'en'))
      or (r.v ? 'is_lead' and jsonb_typeof(r.v -> 'is_lead') <> 'boolean') then
      raise exception using message = 'bad_request', detail = format('row %s', r.n), errcode = '22023';
    end if;
    if not exists (
      select 1 from public.staff st
      where st.id = (r.v ->> 'staff_id')::uuid and st.workspace_id = v_e.workspace_id
    ) then
      raise exception using message = 'bad_request', detail = format('row %s: staff_id', r.n), errcode = '22023';
    end if;
    insert into pg_temp.uki_assign values (r.n, (r.v ->> 'staff_id')::uuid, (r.v ->> 'seat_from')::int,
      (r.v ->> 'seat_to')::int,
      array(select distinct l::public.locale from jsonb_array_elements_text(r.v -> 'languages') as l),
      coalesce((r.v ->> 'is_lead')::boolean, false));
  end loop;

  if exists (select 1 from pg_temp.uki_assign a group by a.staff_id having count(*) > 1) then
    raise exception using message = 'bad_request', detail = 'a proctor appears twice', errcode = '22023';
  end if;
  select count(*) filter (where a.is_lead) into v_leads from pg_temp.uki_assign a;
  if v_leads > 1 then
    raise exception using message = 'bad_request', detail = 'one lead at most', errcode = '22023';
  end if;

  v_prev_to := 0;
  for r in select a.* from pg_temp.uki_assign a order by a.seat_from, a.seat_to loop
    if r.seat_from <= v_prev_to then
      raise exception using message = 'overlap', detail = format('seats %s to %s', r.seat_from, v_prev_to),
        errcode = 'P0001';
    elsif r.seat_from > v_prev_to + 1 then
      raise exception using message = 'gap', detail = format('seats %s to %s', v_prev_to + 1, r.seat_from - 1),
        errcode = 'P0001';
    end if;
    v_prev_to := r.seat_to;
  end loop;
  if v_leads = 0 then
    update pg_temp.uki_assign a set is_lead = true where a.seat_from = 1;
  end if;

  v_staff := array(select a.staff_id from pg_temp.uki_assign a);
  delete from public.proctor_assignments pa
  where pa.exam_id = v_e.id and pa.staff_id <> all (v_staff);
  insert into public.proctor_assignments as pa (exam_id, staff_id, seat_from, seat_to, languages, is_lead)
  select v_e.id, a.staff_id, a.seat_from, a.seat_to, a.languages, a.is_lead from pg_temp.uki_assign a
  on conflict (exam_id, staff_id) do update
    set seat_from = excluded.seat_from,
        seat_to = excluded.seat_to,
        languages = excluded.languages,
        is_lead = excluded.is_lead,
        confirmed_at = case
          when (pa.seat_from, pa.seat_to) is distinct from (excluded.seat_from, excluded.seat_to) then null
          else pa.confirmed_at end,
        change_request = case
          when (pa.seat_from, pa.seat_to) is distinct from (excluded.seat_from, excluded.seat_to) then null
          else pa.change_request end;

  perform public.write_audit(v_e.workspace_id, 'staff', 'proctors.assign', 'exam', v_e.id::text,
    jsonb_build_object('proctors', cardinality(v_staff)));

  return coalesce((
    select jsonb_agg(public.assignment_json(pa.exam_id, pa.staff_id) order by pa.seat_from)
    from public.proctor_assignments pa where pa.exam_id = v_e.id
  ), '[]'::jsonb);
end;
$$;

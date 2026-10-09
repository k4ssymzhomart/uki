-- A1 (docs/finals-plan.md): the default phone_score goes from 0.85 to 0.55.
--
-- The live test of 9 October (docs/phase-1-exit.md, "Live test, 9 October") scored real phones 0.50 to
-- 0.79 and gave 0 detections at 0.85; the reason is in docs/decisions.md, "Detection thresholds:
-- phone_score 0.55". DEFAULT_EXAM_CHECKS in packages/contracts/src/checks.ts says the same.
--
-- 1. The column defaults of exams.checks and workspaces.settings: a fresh database (the seed, CI) and
--    every exam or workspace made without these columns start at 0.55.
-- 2. save_exam_draft copies workspaces.settings.default_checks into a new draft, so a workspace whose
--    default is still the untouched 0.85 moves to 0.55, and a new draft shows 0.55 on the cloud
--    project too. "Untouched" means 0.85 and no settings.update audit row that changed phone_score:
--    a value someone chose on A.4, 0.85 included, stays. The workspaces_settings_audit trigger
--    records the move as settings.update (actor service), as every settings change.
-- Existing exams keep their checks: an exam's checks were chosen for it (demo:reset and judge:setup
-- set their own exams).

alter table public.exams alter column checks set default
  '{"gaze_s":2,"phone_score":0.55,"face_missing_s":10,"identity":true,"lock":true}';

alter table public.workspaces alter column settings set default
  '{"retention_days":90,"lobby_minutes":20,"default_duration_min":90,
    "default_checks":{"gaze_s":2,"phone_score":0.55,"face_missing_s":10,"identity":true,"lock":true}}';

-- True when the workspace's default phone_score is still the old column default 0.85 that nobody set:
-- no settings.update audit row of the workspace changed default_checks.phone_score.
create or replace function public.phone_score_untouched(p_workspace uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select w.settings #> '{default_checks,phone_score}' = '0.85'::jsonb
     from public.workspaces w where w.id = p_workspace), false)
    and not exists (
      select 1 from public.audit_log a
      where a.workspace_id = p_workspace
        and a.action = 'settings.update'
        and a.object_type = 'workspace'
        and a.object_id = p_workspace::text
        and (a.meta #> '{before,default_checks,phone_score}')
          is distinct from (a.meta #> '{after,default_checks,phone_score}')
    )
$$;

revoke execute on function public.phone_score_untouched(uuid) from public, anon, authenticated;

update public.workspaces w
set settings = jsonb_set(w.settings, '{default_checks,phone_score}', '0.55'::jsonb)
where public.phone_score_untouched(w.id);

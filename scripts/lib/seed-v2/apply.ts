// Writes seed v2 (world.ts, term.ts, story.ts) to a Supabase project through PostgREST, Storage and two
// staff calls, with the secret key: what `pnpm demo:reset` restores after a rehearsal, on the local
// stack or the cloud project. Every step is idempotent: rows with fixed ids are upserted, the term and
// the old exam are rebuilt only when they differ from the plan, and rehearsal leftovers (exams the wizard
// made, help requests, shares, data requests, History's decisions and notes) are deleted.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAMES_BUCKET } from "../../../packages/contracts/src/index.ts";
import type { Json, TablesInsert } from "../../../packages/db/src/index.ts";
import { type Logger, must, ok } from "../cli.ts";
import type { ScriptEnv } from "../env.ts";
import { ROOT } from "../paths.ts";
import { staffClient, type UkiClient } from "../supabase.ts";
import { type Cleared, deleteExam, inChunks } from "./clear.ts";
import {
  copyExportPath,
  DANA_LANGUAGES,
  DATA_REQUEST,
  DELETE_STUDENT_HISTORY_SESSION,
  EXAM,
  historyStills,
  INVITES_SENT_DAYS_AGO,
  isHistorySeedEvent,
  isSeedExamId,
  isSeedStudentId,
  MATH2_PROCTORS,
  math2Invites,
  OLD_EXAM_ID,
  type OldExamPlan,
  oldExamPlan,
  PHYSICS_HELP,
  SHARED_REPORT,
  STAFF_EMAIL,
  type StaffKey,
  type StillFile,
} from "./story.ts";
import { buildTermPlan, type TermPlan } from "./term.ts";
import { allStudents, FACULTY, GROUPS, groupByCode, groupId, PEOPLE, WORKSPACE_ID } from "./world.ts";

export const STILLS_DIR = join(ROOT, "demo", "stills");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

export interface ApplyOptions {
  client: UkiClient;
  env: ScriptEnv;
  /** The server's clock, in epoch milliseconds. */
  nowMs: number;
  dryRun: boolean;
  log: Logger;
  /** Where the still JPEGs are (default demo/stills). */
  stillsDir?: string;
}

/** One line per step for the summary: what it found and what it did. */
export type StepReport = { step: string; detail: string };

async function staffIds(client: UkiClient): Promise<Record<StaffKey, string>> {
  const wanted = new Map(Object.entries(STAFF_EMAIL).map(([key, email]) => [email, key as StaffKey]));
  const found: Partial<Record<StaffKey, string>> = {};
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing users: ${error.message}`);
    for (const user of data.users) {
      const key = user.email ? wanted.get(user.email.toLowerCase()) : undefined;
      if (key) found[key] = user.id;
    }
    if (data.users.length < 1000) break;
  }
  const missing = Object.keys(STAFF_EMAIL).filter((key) => found[key as StaffKey] === undefined);
  if (missing.length > 0) {
    throw new Error(`staff accounts missing (${missing.join(", ")}): run pnpm seed:staff first`);
  }
  return found as Record<StaffKey, string>;
}

async function selectAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function insertAll<T extends object>(
  client: UkiClient,
  table: string,
  rows: readonly T[],
  options: { onConflict?: string; size?: number } = {},
): Promise<void> {
  await inChunks(rows, options.size ?? 500, async (chunk) => {
    // The table name is checked by the typed callers; the untyped call keeps this helper generic.
    const query = (client as unknown as { from: (t: string) => { upsert: Function; insert: Function } }).from(
      table,
    );
    const result = options.onConflict
      ? await query.upsert(chunk, { onConflict: options.onConflict })
      : await query.insert(chunk);
    ok(result as { error: { message: string } | null }, `write ${table}`);
  });
}

// ---------------------------------------------------------------------------------------------------
// The world: groups and students
// ---------------------------------------------------------------------------------------------------

async function applyWorld(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  // Students the wizard added (any id outside the seed's scheme) go once nothing references them.
  const students = await selectAll<{ id: string; student_number: string }>("students", (from, to) =>
    client.from("students").select("id, student_number").eq("workspace_id", WORKSPACE_ID).range(from, to),
  );
  const extra = students.filter((row) => !isSeedStudentId(row.id));
  if (!o.dryRun) {
    await inChunks(
      extra.map((row) => row.id),
      100,
      async (chunk) => {
        ok(await client.from("invites").delete().in("student_id", chunk), "delete their invites");
        ok(await client.from("exam_students").delete().in("student_id", chunk), "delete their seats");
        ok(await client.from("data_requests").delete().in("student_id", chunk), "delete their requests");
        const result = await client.from("students").delete().in("id", chunk);
        if (result.error) o.log.warn(`kept ${chunk.length} added students: ${result.error.message}`);
      },
    );
    const groupRows: TablesInsert<"groups">[] = GROUPS.map((group) => ({
      id: group.id,
      workspace_id: WORKSPACE_ID,
      faculty_id: FACULTY[group.faculty],
      code: group.code,
    }));
    await insertAll(client, "groups", groupRows, { onConflict: "id" });
    const studentRows: TablesInsert<"students">[] = allStudents().map((student) => ({
      id: student.id,
      workspace_id: WORKSPACE_ID,
      student_number: student.number,
      full_name: student.fullName,
      email: student.email,
      group_id: groupId(student.groupCode),
      locale: student.locale,
      programme: student.programme,
      year: student.year,
    }));
    await insertAll(client, "students", studentRows, { onConflict: "id" });
  }
  report.push({
    step: "students",
    detail: `${allStudents().length} with programme and year in ${GROUPS.length} groups; ${extra.length} added by the wizard ${o.dryRun ? "would go" : "removed"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Exams the wizard made
// ---------------------------------------------------------------------------------------------------

async function deleteWizardExams(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const exams = must(
    await o.client.from("exams").select("id, title, status").eq("workspace_id", WORKSPACE_ID),
    "exams",
  );
  const extra = exams.filter((exam) => !isSeedExamId(exam.id));
  let sessions = 0;
  for (const exam of extra) {
    const cleared: Cleared = await deleteExam(o.client, exam.id, o.dryRun);
    sessions += cleared.sessions;
  }
  const names = extra.map((exam) => exam.title.trim() || "(untitled draft)");
  report.push({
    step: "wizard exams",
    detail:
      extra.length === 0
        ? "none"
        : `${extra.length} ${o.dryRun ? "would be deleted" : "deleted"} with ${sessions} sessions: ${names.join(", ")}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------------------------------

type DecisionRow = { session_id: string; decision: string; decided_at: string; reviewer_id: string };

async function termMatches(
  o: ApplyOptions,
  plan: TermPlan,
  staff: Record<StaffKey, string>,
): Promise<string | null> {
  const { client } = o;
  const ids = plan.exams.map((exam) => exam.id);
  const exams = must(await client.from("exams").select("id, starts_at, status").in("id", ids), "term exams");
  if (exams.length !== ids.length) return `${exams.length} of ${ids.length} exams`;
  const byId = new Map(plan.exams.map((exam) => [exam.id, exam]));
  for (const row of exams) {
    const exam = byId.get(row.id);
    if (!exam || Date.parse(row.starts_at) !== Date.parse(exam.startsAt) || row.status !== "reviewed") {
      return `exam ${row.id} changed`;
    }
  }
  const sessions = await client
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .in("exam_id", ids);
  if (sessions.error) throw new Error(`count term sessions: ${sessions.error.message}`);
  if (sessions.count !== plan.sessions.length) return `${sessions.count} of ${plan.sessions.length} sessions`;
  const roster = await client
    .from("exam_students")
    .select("*", { count: "exact", head: true })
    .in("exam_id", ids);
  if (roster.error) throw new Error(`count term roster: ${roster.error.message}`);
  if (roster.count !== plan.roster.length) return `${roster.count} of ${plan.roster.length} roster rows`;
  const events = await selectAll<{ id: string }>("term events", (from, to) =>
    client.from("events").select("id").in("exam_id", ids).order("id").range(from, to),
  );
  const planned = new Set(plan.events.map((event) => event.id));
  if (events.length !== planned.size || events.some((row) => !planned.has(row.id))) {
    return `${events.length} of ${planned.size} flags`;
  }
  const decisions = await selectAll<DecisionRow>("term decisions", (from, to) =>
    client
      .from("review_decisions")
      .select("session_id, decision, decided_at, reviewer_id")
      .in("exam_id", ids)
      .order("session_id")
      .range(from, to),
  );
  const want = new Map(plan.decisions.map((decision) => [decision.sessionId, decision]));
  if (decisions.length !== want.size) return `${decisions.length} of ${want.size} decisions`;
  for (const row of decisions) {
    const planned = want.get(row.session_id);
    if (
      !planned ||
      planned.decision !== row.decision ||
      Date.parse(planned.decidedAt) !== Date.parse(row.decided_at) ||
      staff[planned.reviewer] !== row.reviewer_id
    ) {
      return `decision on ${row.session_id} changed`;
    }
  }
  return null;
}

/** Receipt ids other sessions already hold: a planned receipt that clashes takes the next number. */
async function freeReceipts(o: ApplyOptions, plan: TermPlan): Promise<Map<string, string>> {
  const termIds = new Set(plan.exams.map((exam) => exam.id));
  const taken = await selectAll<{ receipt_id: string | null; exam_id: string }>("receipts", (from, to) =>
    o.client
      .from("sessions")
      .select("receipt_id, exam_id")
      .not("receipt_id", "is", null)
      .order("id")
      .range(from, to),
  );
  const used = new Set(taken.filter((row) => !termIds.has(row.exam_id)).map((row) => row.receipt_id ?? ""));
  const mine = new Set(plan.sessions.map((session) => session.receiptId));
  const result = new Map<string, string>();
  for (const session of plan.sessions) {
    let receipt = session.receiptId;
    while (used.has(receipt) || (receipt !== session.receiptId && mine.has(receipt))) {
      const match = /^(UKI-[A-Z0-9]+-)(\d{4})(-[A-Z]{2})$/.exec(receipt);
      if (!match) break;
      receipt = `${match[1]}${String((Number(match[2]) + 1) % 10_000).padStart(4, "0")}${match[3]}`;
    }
    used.add(receipt);
    result.set(session.id, receipt);
  }
  return result;
}

async function writeTerm(o: ApplyOptions, plan: TermPlan, staff: Record<StaffKey, string>): Promise<void> {
  const { client } = o;
  const ids = plan.exams.map((exam) => exam.id);
  // Children first: flags, commands, then sessions (decisions, reports and help requests cascade), exams.
  await inChunks(ids, 10, async (chunk) => {
    ok(await client.from("frames").delete().in("exam_id", chunk), "delete term frames");
    ok(await client.from("events").delete().in("exam_id", chunk), "delete term events");
    ok(await client.from("session_commands").delete().in("exam_id", chunk), "delete term commands");
    ok(await client.from("sessions").delete().in("exam_id", chunk), "delete term sessions");
    ok(await client.from("exams").delete().in("id", chunk), "delete term exams");
  });
  const receipts = await freeReceipts(o, plan);
  const exams: TablesInsert<"exams">[] = plan.exams.map((exam) => ({
    id: exam.id,
    workspace_id: WORKSPACE_ID,
    faculty_id: FACULTY[exam.faculty],
    title: exam.title,
    course: exam.course,
    kind: exam.kind,
    code: null,
    mode: "app",
    starts_at: exam.startsAt,
    duration_min: exam.durationMin,
    lobby_opens_at: iso(Date.parse(exam.startsAt) - 20 * 60_000),
    status: "reviewed",
    created_by: staff.dana,
    created_at: iso(Date.parse(exam.startsAt) - 9 * DAY),
    scheduled_at: iso(Date.parse(exam.startsAt) - 8 * DAY),
  }));
  await insertAll(client, "exams", exams);
  await insertAll(
    client,
    "exam_groups",
    plan.exams.flatMap((exam) => exam.groups.map((code) => ({ exam_id: exam.id, group_id: groupId(code) }))),
  );
  await insertAll(
    client,
    "exam_students",
    plan.roster.map((row) => ({
      exam_id: row.examId,
      student_id: row.studentId,
      seat: row.seat,
      invite_status: "sent",
    })),
    { size: 1000 },
  );
  const sessions: TablesInsert<"sessions">[] = plan.sessions.map((session) => ({
    id: session.id,
    exam_id: session.examId,
    student_id: session.studentId,
    auth_uid: session.authUid,
    state: session.state,
    locale: session.locale,
    device: { os: session.os, app_version: "0.1.0" },
    identity_result: "matched",
    identity_score: session.identityScore,
    joined_at: session.joinedAt,
    started_at: session.startedAt,
    submitted_at: session.submittedAt,
    time_used_s: session.timeUsedS,
    last_seen_at: session.submittedAt,
    receipt_id: receipts.get(session.id) ?? session.receiptId,
    rules_accepted_at: session.rulesAcceptedAt,
    rules_locale: session.locale,
  }));
  await insertAll(client, "sessions", sessions);
  const events: TablesInsert<"events">[] = plan.events.map((event) => ({
    id: event.id,
    session_id: event.sessionId,
    exam_id: event.examId,
    type: event.type,
    source: event.source,
    review: "flag",
    seq: event.seq,
    at: event.at,
    received_at: event.receivedAt,
    data: event.data as Json,
    frame_count: 0,
    app_version: "0.1.0",
  }));
  await insertAll(client, "events", events);
  const decisions: TablesInsert<"review_decisions">[] = plan.decisions.map((decision) => ({
    session_id: decision.sessionId,
    exam_id: decision.examId,
    decision: decision.decision,
    note: decision.note,
    reviewer_id: staff[decision.reviewer],
    decided_at: decision.decidedAt,
  }));
  await insertAll(client, "review_decisions", decisions);
}

async function applyTerm(
  o: ApplyOptions,
  staff: Record<StaffKey, string>,
  report: StepReport[],
): Promise<TermPlan> {
  const plan = buildTermPlan();
  const differs = await termMatches(o, plan, staff);
  if (differs !== null && !o.dryRun) await writeTerm(o, plan, staff);
  report.push({
    step: "Autumn 2026 term",
    detail:
      differs === null
        ? `in place: ${plan.exams.length} exams, ${plan.sessions.length} sessions, ${plan.events.length} flags, ${plan.decisions.length} decisions`
        : `${o.dryRun ? "would rebuild" : "rebuilt"} (${differs}): ${plan.exams.length} exams, ${plan.sessions.length} sessions, ${plan.events.length} flags, ${plan.decisions.length} decisions`,
  });
  return plan;
}

// ---------------------------------------------------------------------------------------------------
// Stills
// ---------------------------------------------------------------------------------------------------

async function stillExists(client: UkiClient, path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(FRAMES_BUCKET).list(folder, { search: name, limit: 10 });
  if (error) throw new Error(`storage list ${folder}: ${error.message}`);
  return data.some((entry) => entry.name === name);
}

async function uploadStill(o: ApplyOptions, path: string, file: StillFile): Promise<void> {
  const bytes = readFileSync(join(o.stillsDir ?? STILLS_DIR, file));
  const { error } = await o.client.storage
    .from(FRAMES_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`storage upload ${path}: ${error.message}`);
}

/** The flag's still: the object, its frames row at the flag's time, and frame_count 1. */
async function ensureStill(
  o: ApplyOptions,
  still: {
    frameId: string;
    eventId: string;
    sessionId: string;
    examId: string;
    path: string;
    file: StillFile;
  },
  capturedAt: string,
): Promise<boolean> {
  const present = await stillExists(o.client, still.path);
  const rows = must(
    await o.client
      .from("frames")
      .select("id, captured_at")
      .eq("event_id", still.eventId)
      .eq("storage_path", still.path),
    "frames row",
  );
  const rowOk = rows.length === 1 && Date.parse(rows[0]?.captured_at ?? "") === Date.parse(capturedAt);
  if (present && rowOk) return false;
  if (o.dryRun) return true;
  if (!present) await uploadStill(o, still.path, still.file);
  ok(await o.client.from("frames").delete().eq("event_id", still.eventId), "delete frames row");
  ok(
    await o.client.from("frames").insert({
      id: still.frameId,
      event_id: still.eventId,
      session_id: still.sessionId,
      exam_id: still.examId,
      storage_path: still.path,
      captured_at: capturedAt,
    }),
    "frames row",
  );
  ok(await o.client.from("events").update({ frame_count: 1 }).eq("id", still.eventId), "frame_count");
  return true;
}

// ---------------------------------------------------------------------------------------------------
// History of Kazakhstan: undecided, with stills
// ---------------------------------------------------------------------------------------------------

async function applyHistory(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  const decisions = await client
    .from("review_decisions")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", EXAM.history);
  if (decisions.error) throw new Error(`History decisions: ${decisions.error.message}`);
  const events = must(
    await client.from("events").select("id, at").eq("exam_id", EXAM.history),
    "History events",
  );
  const extra = events.filter((event) => !isHistorySeedEvent(event.id));
  const reports = must(
    await client.from("reports").select("id").eq("exam_id", EXAM.history),
    "History reports",
  );
  const exam = must(await client.from("exams").select("status").eq("id", EXAM.history), "History")[0];
  if (!exam) throw new Error("History of Kazakhstan not found: load supabase/seed.sql first");
  let stills = 0;
  if (!o.dryRun) {
    ok(
      await client.from("review_decisions").delete().eq("exam_id", EXAM.history),
      "delete History decisions",
    );
    ok(await client.from("reports").delete().eq("exam_id", EXAM.history), "delete History reports");
    await inChunks(
      extra.map((event) => event.id),
      100,
      async (chunk) => {
        ok(await client.from("frames").delete().in("event_id", chunk), "delete note frames");
        ok(await client.from("events").delete().in("id", chunk), "delete History notes");
      },
    );
    ok(
      await client.from("exams").update({ status: "to_review" }).eq("id", EXAM.history),
      "History to_review",
    );
  }
  const at = new Map(events.map((event) => [event.id, event.at]));
  for (const still of historyStills()) {
    const flagAt = at.get(still.eventId);
    if (!flagAt) throw new Error(`History flag ${still.eventId} is missing: load supabase/seed.sql again`);
    if (await ensureStill(o, still, flagAt)) stills += 1;
  }
  report.push({
    step: "History of Kazakhstan",
    detail: `${decisions.count ?? 0} decisions, ${reports.length} reports and ${extra.length} added events ${o.dryRun ? "would be" : ""} cleared; status ${exam.status} -> to_review; ${stills} of 7 stills ${o.dryRun ? "to put back" : "put back"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Mathematics 2: invites and proctors
// ---------------------------------------------------------------------------------------------------

async function applyMath2(
  o: ApplyOptions,
  staff: Record<StaffKey, string>,
  report: StepReport[],
): Promise<void> {
  const { client } = o;
  const invites = math2Invites();
  const current = must(
    await client.from("invites").select("student_id, email, state").eq("exam_id", EXAM.math2),
    "Mathematics 2 invites",
  );
  const want = new Map(invites.map((invite) => [invite.studentId, invite]));
  const changed =
    current.filter((row) => {
      const invite = want.get(row.student_id);
      return !invite || invite.email !== row.email || invite.state !== row.state;
    }).length + Math.max(0, invites.length - current.length);
  const assignments = must(
    await client
      .from("proctor_assignments")
      .select("staff_id, seat_from, seat_to, confirmed_at, change_request")
      .eq("exam_id", EXAM.math2),
    "Mathematics 2 proctors",
  );
  const confirmed = assignments.filter(
    (row) => row.confirmed_at !== null || row.change_request !== null,
  ).length;
  if (!o.dryRun) {
    const sentAt = iso(o.nowMs - INVITES_SENT_DAYS_AGO * DAY);
    const rows: TablesInsert<"invites">[] = invites.map((invite) => ({
      exam_id: invite.examId,
      student_id: invite.studentId,
      email: invite.email,
      locale: invite.locale,
      state: invite.state,
      provider_id: null,
      error: null,
      sent_at: sentAt,
    }));
    const keep = new Set(invites.map((invite) => invite.studentId));
    const stray = current.filter((row) => !keep.has(row.student_id)).map((row) => row.student_id);
    if (stray.length > 0) {
      ok(
        await client.from("invites").delete().eq("exam_id", EXAM.math2).in("student_id", stray),
        "stray invites",
      );
    }
    await insertAll(client, "invites", rows, { onConflict: "exam_id,student_id" });
    const proctors = new Set(MATH2_PROCTORS.map((row) => staff[row.staff]));
    const others = assignments.filter((row) => !proctors.has(row.staff_id)).map((row) => row.staff_id);
    if (others.length > 0) {
      ok(
        await client.from("proctor_assignments").delete().eq("exam_id", EXAM.math2).in("staff_id", others),
        "other proctors",
      );
    }
    await insertAll(
      client,
      "proctor_assignments",
      MATH2_PROCTORS.map((row) => ({
        exam_id: EXAM.math2,
        staff_id: staff[row.staff],
        seat_from: row.seatFrom,
        seat_to: row.seatTo,
        languages: row.languages,
        is_lead: row.isLead,
        confirmed_at: null,
        change_request: null,
      })),
      { onConflict: "exam_id,staff_id" },
    );
  }
  report.push({
    step: "Mathematics 2",
    detail: `${invites.length} invites (Yerlan's bounced), ${changed} ${o.dryRun ? "to put back" : "put back"}; Aigerim 1-64 and Nurlan 65-128 unconfirmed (${confirmed} confirmed or changed before)`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Physics 1: the simulated student's open help request
// ---------------------------------------------------------------------------------------------------

async function applyPhysicsHelp(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  const exam = must(await client.from("exams").select("starts_at").eq("id", EXAM.physics1), "Physics 1")[0];
  if (!exam) throw new Error("Physics 1 not found: load supabase/seed.sql first");
  const others = must(
    await client.from("help_requests").select("id, event_id, done_at"),
    "help requests",
  ).filter((row) => row.event_id !== PHYSICS_HELP.eventId);
  const existing = must(
    await client.from("help_requests").select("id, done_at").eq("event_id", PHYSICS_HELP.eventId),
    "seeded help request",
  )[0];
  if (!o.dryRun) {
    await inChunks(
      others.map((row) => row.id),
      100,
      async (chunk) => {
        ok(await client.from("help_requests").delete().in("id", chunk), "delete rehearsal help requests");
      },
    );
    if (existing && existing.done_at !== null) {
      ok(
        await client
          .from("help_requests")
          .update({ done_at: null, done_by: null, reply: null })
          .eq("id", existing.id),
        "reopen the help request",
      );
    }
    if (!existing) {
      const start = Date.parse(exam.starts_at);
      const student = must(
        await client.from("students").select("locale, full_name").eq("id", PHYSICS_HELP.studentId),
        "help student",
      )[0];
      if (!student) throw new Error("the Physics 1 help student is missing");
      const minute = (m: number) => iso(start + m * 60_000);
      // A finished session: the tile shows Done rather than No signal, and the request stays open.
      const session: TablesInsert<"sessions"> = {
        id: PHYSICS_HELP.sessionId,
        exam_id: EXAM.physics1,
        student_id: PHYSICS_HELP.studentId,
        auth_uid: PHYSICS_HELP.authUid,
        state: "submitted",
        locale: student.locale,
        device: { os: "windows", app_version: "0.1.0-sim", simulated: true },
        identity_result: "matched",
        identity_score: 0.84,
        joined_at: minute(PHYSICS_HELP.joinedMin),
        rules_accepted_at: minute(PHYSICS_HELP.rulesMin),
        rules_locale: student.locale,
        started_at: minute(0),
        submitted_at: minute(PHYSICS_HELP.submittedMin),
        time_used_s: PHYSICS_HELP.submittedMin * 60,
        last_seen_at: minute(PHYSICS_HELP.submittedMin),
      };
      ok(await client.from("sessions").upsert(session, { onConflict: "id" }), "help session");
      ok(
        await client.from("events").upsert(
          {
            id: PHYSICS_HELP.eventId,
            session_id: PHYSICS_HELP.sessionId,
            exam_id: EXAM.physics1,
            type: "student.help_requested",
            source: "lock",
            review: "log",
            seq: 12,
            at: minute(PHYSICS_HELP.askedMin),
            received_at: iso(start + PHYSICS_HELP.askedMin * 60_000 + 1000),
            data: { topic: PHYSICS_HELP.topic, text: PHYSICS_HELP.text },
            frame_count: 0,
            app_version: "0.1.0-sim",
          },
          { onConflict: "id" },
        ),
        "help event",
      );
    }
  }
  report.push({
    step: "Physics 1",
    detail: `the simulated student's help request ${existing ? (existing.done_at ? "reopened" : "open") : o.dryRun ? "to add" : "added"}; ${others.length} rehearsal help requests ${o.dryRun ? "would go" : "removed"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Data requests (A.5)
// ---------------------------------------------------------------------------------------------------

async function backdateAudit(o: ApplyOptions, ids: number[], at: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await o.client.from("audit_log").update({ at }).in("id", ids);
  if (error) o.log.warn(`audit rows keep the time of this run: ${error.message}`);
}

async function applyDataRequests(
  o: ApplyOptions,
  staff: Record<StaffKey, string>,
  plan: TermPlan,
  report: StepReport[],
): Promise<void> {
  const { client } = o;
  const rows = must(
    await client.from("data_requests").select("id, status").eq("workspace_id", WORKSPACE_ID),
    "data requests",
  );
  const seeded = new Set<string>([DATA_REQUEST.delete.id, DATA_REQUEST.copy.id]);
  const extra = rows.filter((row) => !seeded.has(row.id));
  const deleteRow = rows.find((row) => row.id === DATA_REQUEST.delete.id);
  if (!o.dryRun) {
    await inChunks(
      extra.map((row) => row.id),
      100,
      async (chunk) => {
        ok(await client.from("data_requests").delete().in("id", chunk), "delete rehearsal data requests");
      },
    );
    const received = (days: number) => o.nowMs - days * DAY;
    const isNew = new Set(
      Object.values(DATA_REQUEST).flatMap((value) =>
        typeof value === "object" && !rows.some((row) => row.id === value.id) ? [value.id] : [],
      ),
    );
    const requests: TablesInsert<"data_requests">[] = [
      {
        id: DATA_REQUEST.delete.id,
        workspace_id: WORKSPACE_ID,
        student_id: DATA_REQUEST.delete.studentId,
        kind: "delete",
        status: "received",
        received_at: iso(received(DATA_REQUEST.delete.receivedDaysAgo)),
        due_at: iso(received(DATA_REQUEST.delete.receivedDaysAgo) + DATA_REQUEST.dueDays * DAY),
        reply: null,
        export_path: null,
        done_by: null,
        done_at: null,
      },
      {
        id: DATA_REQUEST.copy.id,
        workspace_id: WORKSPACE_ID,
        student_id: DATA_REQUEST.copy.studentId,
        kind: "copy",
        status: "done",
        received_at: iso(received(DATA_REQUEST.copy.receivedDaysAgo)),
        due_at: iso(received(DATA_REQUEST.copy.receivedDaysAgo) + DATA_REQUEST.dueDays * DAY),
        reply: null,
        export_path: copyExportPath(),
        done_by: staff.dana,
        done_at: iso(received(DATA_REQUEST.copy.doneDaysAgo)),
      },
    ];
    for (const request of requests) {
      ok(await client.from("data_requests").upsert(request, { onConflict: "id" }), "seeded data request");
    }
    // A new row writes data_request.received (the table's trigger) now; it happened when it arrived.
    for (const request of requests) {
      if (!request.id || !isNew.has(request.id)) continue;
      const audit = must(
        await client
          .from("audit_log")
          .select("id")
          .eq("action", "data_request.received")
          .eq("meta->>data_request_id", request.id),
        "request audit rows",
      );
      await backdateAudit(
        o,
        audit.map((row) => row.id),
        request.received_at ?? iso(o.nowMs),
      );
    }
    const copyAudit = must(
      await client
        .from("audit_log")
        .select("id")
        .eq("action", "data_request.copy")
        .eq("meta->>data_request_id", DATA_REQUEST.copy.id),
      "copy audit row",
    );
    if (copyAudit.length === 0) {
      const doneAt = received(DATA_REQUEST.copy.doneDaysAgo);
      ok(
        await client.from("audit_log").insert({
          workspace_id: WORKSPACE_ID,
          actor_id: staff.dana,
          actor_kind: "staff",
          action: "data_request.copy",
          object_type: "student",
          object_id: DATA_REQUEST.copy.studentId,
          at: iso(doneAt),
          meta: {
            data_request_id: DATA_REQUEST.copy.id,
            bytes: DATA_REQUEST.copy.bytes,
            link_expires_at: iso(doneAt + 7 * DAY),
          },
        }),
        "copy audit row",
      );
    }
    // A privacy delete in rehearsal cleared the student's identity scores and device records.
    ok(
      await client
        .from("sessions")
        .update({
          identity_score: DELETE_STUDENT_HISTORY_SESSION.identityScore,
          device: DELETE_STUDENT_HISTORY_SESSION.device,
        })
        .eq("id", DELETE_STUDENT_HISTORY_SESSION.id),
      "restore the History session",
    );
    for (const session of plan.sessions.filter((row) => row.number === PEOPLE.deleteRequest)) {
      ok(
        await client
          .from("sessions")
          .update({ identity_score: session.identityScore, device: { os: session.os, app_version: "0.1.0" } })
          .eq("id", session.id),
        "restore a term session",
      );
    }
  }
  report.push({
    step: "data requests",
    detail: `the delete request (${deleteRow ? deleteRow.status : "missing"} -> received, 3 days ago) and the copy request (done last week); ${extra.length} rehearsal requests ${o.dryRun ? "would go" : "removed"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// The English B2 report, shared and opened twice (A.6)
// ---------------------------------------------------------------------------------------------------

async function shareViews(client: UkiClient, shareId: string): Promise<number[]> {
  const rows = must(
    await client
      .from("audit_log")
      .select("id")
      .eq("action", "report.share_view")
      .eq("meta->>share_id", shareId)
      .order("id"),
    "share views",
  );
  return rows.map((row) => row.id);
}

async function applySharedReport(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  const reports = must(await client.from("reports").select("id, session_id"), "reports");
  const seeded = reports.find((row) => row.session_id === SHARED_REPORT.sessionId);
  const otherReports = reports.filter((row) => row.session_id !== SHARED_REPORT.sessionId);
  const shares = must(
    await client
      .from("report_shares")
      .select("id, report_id, created_at, expires_at, revoked_at")
      .order("created_at"),
    "shares",
  );
  const seededShare = seeded ? shares.find((share) => share.report_id === seeded.id) : undefined;
  const healthy =
    seededShare !== undefined &&
    seededShare.revoked_at === null &&
    Date.parse(seededShare.expires_at) > o.nowMs + DAY &&
    (await shareViews(client, seededShare.id)).length >= 2;
  const extraShares = shares.filter((share) => share.id !== (healthy ? seededShare?.id : undefined));
  if (!o.dryRun) {
    await inChunks(
      otherReports.map((row) => row.id),
      100,
      async (chunk) => {
        ok(await client.from("reports").delete().in("id", chunk), "delete rehearsal reports");
      },
    );
    await inChunks(
      extraShares.map((row) => row.id),
      100,
      async (chunk) => {
        ok(await client.from("report_shares").delete().in("id", chunk), "delete rehearsal shares");
      },
    );
    if (!healthy) await makeSharedReport(o);
  }
  report.push({
    step: "English B2 report",
    detail: `${healthy ? "shared, 2 views: in place" : o.dryRun ? "to make, share and open twice" : "made with get_report, shared and opened twice"}; ${otherReports.length} other reports and ${extraShares.length - (healthy ? 0 : seededShare ? 1 : 0)} rehearsal shares ${o.dryRun ? "would go" : "removed"}`,
  });
}

async function sha256Hex(text: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function makeSharedReport(o: ApplyOptions): Promise<void> {
  const { client } = o;
  const dana = await staffClient(o.env, STAFF_EMAIL.dana);
  try {
    const payload = await dana.client.rpc("get_report", { session_id: SHARED_REPORT.sessionId });
    if (payload.error) throw new Error(`get_report: ${payload.error.message}`);
    const row = must(
      await client.from("reports").select("id, verify_code").eq("session_id", SHARED_REPORT.sessionId),
      "the English B2 report",
    )[0];
    if (!row) throw new Error("get_report made no reports row");
    const shared = await dana.client.rpc("create_share", { report_id: row.id });
    if (shared.error) throw new Error(`create_share: ${shared.error.message}`);
    const share = shared.data as { share_id?: string; token?: string } | null;
    if (!share?.share_id || !share.token) throw new Error("create_share returned no token");
    const hash = await sha256Hex(share.token);
    for (let view = 0; view < 2; view += 1) {
      const opened = await client.rpc("open_shared_report", { p_token_hash: hash });
      if (opened.error) throw new Error(`open_shared_report: ${opened.error.message}`);
    }
    // The story's times: made and shared two days ago, opened a day later and yesterday evening.
    const sharedAt = o.nowMs - SHARED_REPORT.sharedHoursAgo * HOUR;
    ok(
      await client
        .from("report_shares")
        .update({ created_at: iso(sharedAt), expires_at: iso(sharedAt + 7 * DAY) })
        .eq("id", share.share_id),
      "share times",
    );
    ok(
      await client
        .from("reports")
        .update({ created_at: iso(sharedAt - 10 * 60_000) })
        .eq("id", row.id),
      "report time",
    );
    const madeRows = must(
      await client.from("audit_log").select("id").eq("action", "report.view").eq("meta->>report_id", row.id),
      "report view rows",
    );
    await backdateAudit(
      o,
      madeRows.map((r) => r.id),
      iso(sharedAt - 10 * 60_000),
    );
    const shareRows = must(
      await client
        .from("audit_log")
        .select("id")
        .eq("action", "report.share")
        .eq("meta->>share_id", share.share_id),
      "share rows",
    );
    await backdateAudit(
      o,
      shareRows.map((r) => r.id),
      iso(sharedAt),
    );
    const views = await shareViews(client, share.share_id);
    for (const [i, id] of views.entries()) {
      await backdateAudit(o, [id], iso(o.nowMs - (SHARED_REPORT.viewsHoursAgo[i] ?? 1) * HOUR));
    }
  } finally {
    await dana.client.auth.signOut();
  }
}

// ---------------------------------------------------------------------------------------------------
// The still 91 days old
// ---------------------------------------------------------------------------------------------------

async function applyOldExam(
  o: ApplyOptions,
  staff: Record<StaffKey, string>,
  report: StepReport[],
): Promise<void> {
  const { client } = o;
  const plan: OldExamPlan = oldExamPlan(o.nowMs);
  const exam = must(
    await client.from("exams").select("id, starts_at").eq("id", OLD_EXAM_ID),
    "the old exam",
  )[0];
  const sessions = await client
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", OLD_EXAM_ID);
  if (sessions.error) throw new Error(`old exam sessions: ${sessions.error.message}`);
  const flag = must(await client.from("events").select("id, at").eq("id", plan.flag.id), "old flag")[0];
  const current =
    exam !== undefined &&
    Date.parse(exam.starts_at) === Date.parse(plan.exam.startsAt) &&
    sessions.count === plan.sessions.length &&
    flag !== undefined &&
    Date.parse(flag.at) === Date.parse(plan.flag.at);
  let still = false;
  if (!o.dryRun) {
    if (!current) {
      if (exam) await deleteExam(client, OLD_EXAM_ID, false);
      await writeOldExam(o, plan, staff);
    }
    still = await ensureStill(
      o,
      {
        frameId: plan.still.frameId,
        eventId: plan.flag.id,
        sessionId: plan.flag.sessionId,
        examId: OLD_EXAM_ID,
        path: plan.still.path,
        file: plan.still.file,
      },
      plan.still.capturedAt,
    );
  }
  report.push({
    step: "old still",
    detail: `${plan.exam.title} on ${plan.exam.startsAt.slice(0, 10)} (${current ? "in place" : o.dryRun ? "to rebuild" : "rebuilt"}), its phone still captured ${plan.still.capturedAt}${still ? ", object put back" : ""}`,
  });
}

async function writeOldExam(
  o: ApplyOptions,
  plan: OldExamPlan,
  staff: Record<StaffKey, string>,
): Promise<void> {
  const { client } = o;
  const start = Date.parse(plan.exam.startsAt);
  ok(
    await client.from("exams").insert({
      id: plan.exam.id,
      workspace_id: WORKSPACE_ID,
      faculty_id: FACULTY.physics,
      title: plan.exam.title,
      course: plan.exam.course,
      kind: plan.exam.kind,
      mode: "app",
      starts_at: plan.exam.startsAt,
      duration_min: plan.exam.durationMin,
      lobby_opens_at: iso(start - 20 * 60_000),
      status: "reviewed",
      created_by: staff.dana,
      created_at: iso(start - 14 * DAY),
      scheduled_at: iso(start - 13 * DAY),
    }),
    "old exam",
  );
  await insertAll(
    client,
    "exam_groups",
    plan.exam.groups.map((code) => ({ exam_id: plan.exam.id, group_id: groupByCode(code).id })),
  );
  await insertAll(
    client,
    "exam_students",
    plan.roster.map((row) => ({
      exam_id: plan.exam.id,
      student_id: row.studentId,
      seat: row.seat,
      invite_status: "sent",
    })),
  );
  await insertAll(
    client,
    "sessions",
    plan.sessions.map((session) => ({
      id: session.id,
      exam_id: plan.exam.id,
      student_id: session.studentId,
      auth_uid: session.authUid,
      state: "submitted" as const,
      locale: session.locale,
      device: { os: session.os, app_version: "0.1.0" },
      identity_result: "matched",
      identity_score: session.identityScore,
      joined_at: iso(start - 8 * 60_000),
      rules_accepted_at: iso(start - 6 * 60_000),
      rules_locale: session.locale,
      started_at: session.startedAt,
      submitted_at: session.submittedAt,
      time_used_s: session.timeUsedS,
      last_seen_at: session.submittedAt,
    })),
  );
  ok(
    await client.from("events").insert({
      id: plan.flag.id,
      session_id: plan.flag.sessionId,
      exam_id: plan.exam.id,
      type: "phone.detected",
      source: "app",
      review: "flag",
      seq: 20,
      at: plan.flag.at,
      received_at: plan.flag.receivedAt,
      data: { score: plan.flag.score, held_ms: plan.flag.heldMs },
      frame_count: 1,
      app_version: "0.1.0",
    }),
    "old flag",
  );
  ok(
    await client.from("review_decisions").insert({
      session_id: plan.flag.sessionId,
      exam_id: plan.exam.id,
      decision: "no_issue",
      note: "Phone on the desk, face down.",
      reviewer_id: staff.gulnara,
      decided_at: plan.decidedAt,
    }),
    "old decision",
  );
}

// ---------------------------------------------------------------------------------------------------
// Dana
// ---------------------------------------------------------------------------------------------------

async function applyDana(
  o: ApplyOptions,
  staff: Record<StaffKey, string>,
  report: StepReport[],
): Promise<void> {
  const row = must(await o.client.from("staff").select("languages").eq("id", staff.dana), "Dana")[0];
  if (!o.dryRun) {
    ok(
      await o.client.from("staff").update({ languages: DANA_LANGUAGES }).eq("id", staff.dana),
      "Dana's languages",
    );
  }
  report.push({
    step: "Dana",
    detail: `languages ${JSON.stringify(row?.languages ?? [])} -> ${JSON.stringify(DANA_LANGUAGES)} (the dashboard opens in English)`,
  });
}

/** Writes seed v2. Phase 0's reset of Mathematics 2 and Physics 1 must already have run. */
export async function applySeedV2(o: ApplyOptions): Promise<StepReport[]> {
  const report: StepReport[] = [];
  const staff = await staffIds(o.client);
  if (o.env.SEED_STAFF_PASSWORD === undefined || o.env.SUPABASE_PUBLISHABLE_KEY === undefined) {
    throw new Error(
      "seed v2 makes the English B2 report as Dana (get_report): set SEED_STAFF_PASSWORD and SUPABASE_PUBLISHABLE_KEY",
    );
  }
  await deleteWizardExams(o, report);
  await applyWorld(o, report);
  const plan = await applyTerm(o, staff, report);
  await applyOldExam(o, staff, report);
  await applyHistory(o, report);
  await applyMath2(o, staff, report);
  await applyPhysicsHelp(o, report);
  await applyDataRequests(o, staff, plan, report);
  await applySharedReport(o, report);
  await applyDana(o, staff, report);
  return report;
}

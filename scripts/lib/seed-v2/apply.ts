// Writes seed v2 (world.ts, term.ts, story.ts) to a Supabase project through PostgREST, Storage and two
// staff calls, with the secret key: what `pnpm demo:reset` restores after a rehearsal, on the local
// stack or the cloud project. Every step is idempotent: rows with fixed ids are upserted, the term is
// repaired row by row (or rebuilt when its exams, sessions or rosters differ), and rehearsal leftovers
// are deleted: exams the wizard made, help requests, reports and shares, data requests, History of
// Kazakhstan's decisions and notes. Judge mode's DEMO-LIVE exam, its roster and its requests are left
// alone. Audit rows are never deleted.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAMES_BUCKET } from "../../../packages/contracts/src/index.ts";
import type { Json, TablesInsert } from "../../../packages/db/src/index.ts";
import { type Logger, must, ok } from "../cli.ts";
import type { ScriptEnv } from "../env.ts";
import { ROOT } from "../paths.ts";
import { listFramesUnder, removeFrames, staffClient, type UkiClient } from "../supabase.ts";
import { deleteExam, inChunks } from "./clear.ts";
import { termDecisionRows } from "./decisions.ts";
import {
  copyExportPath,
  DANA_LANGUAGES,
  DATA_REQUEST,
  DELETE_STUDENT_HISTORY_SESSION,
  deleteStudentStills,
  EXAM,
  historyStills,
  INVITES_SENT_DAYS_AGO,
  isHistorySeedEvent,
  isSeedExamId,
  isSeedStudentId,
  JUDGE_EXAM_CODE,
  MATH2_PROCTORS,
  math2Invites,
  OLD_EXAM_ID,
  type OldExamPlan,
  oldExamPlan,
  PHYSICS_HELP,
  SHARED_REPORT,
  STAFF_EMAIL,
  type StaffKey,
  type StillSeed,
} from "./story.ts";
import { buildTermPlan, type TermPlan } from "./term.ts";
import { allStudents, FACULTY, GROUPS, groupByCode, groupId, PEOPLE, WORKSPACE_ID } from "./world.ts";

export const STILLS_DIR = join(ROOT, "demo", "stills");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
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

type Staff = Record<StaffKey, string>;

async function staffIds(client: UkiClient): Promise<Staff> {
  const wanted = new Map<string, StaffKey>(
    (Object.entries(STAFF_EMAIL) as [StaffKey, string][]).map(([key, email]) => [email, key]),
  );
  const found: Partial<Staff> = {};
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing users: ${error.message}`);
    for (const user of data.users) {
      const key = user.email ? wanted.get(user.email.toLowerCase()) : undefined;
      if (key) found[key] = user.id;
    }
    if (data.users.length < 1000) break;
  }
  const missing = [...wanted.values()].filter((key) => found[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`staff accounts missing (${missing.join(", ")}): run pnpm seed:staff first`);
  }
  return found as Staff;
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

type Writable =
  | "groups"
  | "students"
  | "exams"
  | "exam_groups"
  | "exam_students"
  | "sessions"
  | "events"
  | "review_decisions"
  | "invites"
  | "proctor_assignments";

/** Inserts (or upserts on `onConflict`) `rows` in slices of `size`. */
async function writeRows<T extends Writable>(
  client: UkiClient,
  table: T,
  rows: readonly TablesInsert<T>[],
  options: { onConflict?: string; size?: number } = {},
): Promise<void> {
  await inChunks(rows, options.size ?? 500, async (chunk) => {
    const query = client.from(table);
    const result = options.onConflict
      ? await query.upsert(chunk as never, { onConflict: options.onConflict })
      : await query.insert(chunk as never);
    ok(result, `write ${table}`);
  });
}

// ---------------------------------------------------------------------------------------------------
// Exams the wizard made, and the students it added
// ---------------------------------------------------------------------------------------------------

async function deleteWizardExams(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const exams = must(
    await o.client.from("exams").select("id, title, code").eq("workspace_id", WORKSPACE_ID),
    "exams",
  );
  const extra = exams.filter((exam) => !isSeedExamId(exam.id) && exam.code !== JUDGE_EXAM_CODE);
  let sessions = 0;
  for (const exam of extra) sessions += (await deleteExam(o.client, exam.id, o.dryRun)).sessions;
  const names = extra.map((exam) => exam.title.trim() || "(untitled draft)");
  report.push({
    step: "wizard exams",
    detail:
      extra.length === 0
        ? "none"
        : `${extra.length} ${o.dryRun ? "would be deleted" : "deleted"} with ${sessions} sessions: ${names.join(", ")}`,
  });
}

async function applyWorld(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  const students = await selectAll<{ id: string }>("students", (from, to) =>
    client.from("students").select("id").eq("workspace_id", WORKSPACE_ID).order("id").range(from, to),
  );
  // A student the wizard's roster import added goes once no exam lists them (judge mode's roster stays).
  const added = students.filter((row) => !isSeedStudentId(row.id)).map((row) => row.id);
  const rostered = new Set<string>();
  await inChunks(added, 100, async (chunk) => {
    const rows = must(
      await client.from("exam_students").select("student_id").in("student_id", chunk),
      "rosters",
    );
    for (const row of rows) rostered.add(row.student_id);
  });
  const extra = added.filter((id) => !rostered.has(id));
  if (!o.dryRun) {
    await inChunks(extra, 100, async (chunk) => {
      ok(await client.from("invites").delete().in("student_id", chunk), "delete their invites");
      ok(await client.from("data_requests").delete().in("student_id", chunk), "delete their requests");
      const result = await client.from("students").delete().in("id", chunk);
      if (result.error) o.log.warn(`kept ${chunk.length} added students: ${result.error.message}`);
    });
    await writeRows(
      client,
      "groups",
      GROUPS.map((group) => ({
        id: group.id,
        workspace_id: WORKSPACE_ID,
        faculty_id: FACULTY[group.faculty],
        code: group.code,
      })),
      { onConflict: "id" },
    );
    await writeRows(
      client,
      "students",
      allStudents().map((student) => ({
        id: student.id,
        workspace_id: WORKSPACE_ID,
        student_number: student.number,
        full_name: student.fullName,
        email: student.email,
        group_id: groupId(student.groupCode),
        locale: student.locale,
        programme: student.programme,
        year: student.year,
      })),
      { onConflict: "id" },
    );
  }
  report.push({
    step: "students",
    detail: `${allStudents().length} with programme and year in ${GROUPS.length} groups; ${extra.length} added by the wizard ${o.dryRun ? "would go" : "removed"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------------------------------

interface TermState {
  /** Why the term must be written from scratch, or null when its exams, sessions and rosters are there. */
  rebuild: string | null;
  /** Term exams whose status is not `reviewed`. */
  statusWrong: string[];
  missingEvents: TermPlan["events"];
  extraEvents: string[];
  wrongDecisions: TermPlan["decisions"];
  extraDecisions: string[];
}

async function inspectTerm(o: ApplyOptions, plan: TermPlan, staff: Staff): Promise<TermState> {
  const { client } = o;
  const ids = plan.exams.map((exam) => exam.id);
  const state: TermState = {
    rebuild: null,
    statusWrong: [],
    missingEvents: [],
    extraEvents: [],
    wrongDecisions: [],
    extraDecisions: [],
  };
  const exams = must(await client.from("exams").select("id, starts_at, status").in("id", ids), "term exams");
  const byId = new Map(plan.exams.map((exam) => [exam.id, exam]));
  if (exams.length !== ids.length) {
    state.rebuild = `${exams.length} of ${ids.length} exams`;
    return state;
  }
  for (const row of exams) {
    const exam = byId.get(row.id);
    if (!exam || Date.parse(row.starts_at) !== Date.parse(exam.startsAt)) {
      state.rebuild = `exam ${row.id} moved`;
      return state;
    }
    if (row.status !== "reviewed") state.statusWrong.push(row.id);
  }
  const sessions = await client
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .in("exam_id", ids);
  if (sessions.error) throw new Error(`count term sessions: ${sessions.error.message}`);
  if (sessions.count !== plan.sessions.length) {
    state.rebuild = `${sessions.count} of ${plan.sessions.length} sessions`;
    return state;
  }
  const roster = await client
    .from("exam_students")
    .select("student_id", { count: "exact", head: true })
    .in("exam_id", ids);
  if (roster.error) throw new Error(`count term roster: ${roster.error.message}`);
  if (roster.count !== plan.roster.length) {
    state.rebuild = `${roster.count} of ${plan.roster.length} roster rows`;
    return state;
  }
  const events = await selectAll<{ id: string }>("term events", (from, to) =>
    client.from("events").select("id").in("exam_id", ids).order("id").range(from, to),
  );
  const present = new Set(events.map((row) => row.id));
  const planned = new Set(plan.events.map((event) => event.id));
  state.missingEvents = plan.events.filter((event) => !present.has(event.id));
  state.extraEvents = events.map((row) => row.id).filter((id) => !planned.has(id));
  const decisions = await selectAll<{
    session_id: string;
    decision: string;
    decided_at: string;
    reviewer_id: string;
    note: string | null;
  }>("term decisions", (from, to) =>
    client
      .from("review_decisions")
      .select("session_id, decision, decided_at, reviewer_id, note")
      .in("exam_id", ids)
      .order("session_id")
      .range(from, to),
  );
  const current = new Map(decisions.map((row) => [row.session_id, row]));
  const wanted = new Set(plan.decisions.map((decision) => decision.sessionId));
  state.wrongDecisions = plan.decisions.filter((decision) => {
    const row = current.get(decision.sessionId);
    return (
      row === undefined ||
      row.decision !== decision.decision ||
      row.note !== decision.note ||
      row.reviewer_id !== staff[decision.reviewer] ||
      Date.parse(row.decided_at) !== Date.parse(decision.decidedAt)
    );
  });
  state.extraDecisions = decisions.map((row) => row.session_id).filter((id) => !wanted.has(id));
  return state;
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

function eventRows(events: TermPlan["events"]): TablesInsert<"events">[] {
  return events.map((event) => ({
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
}

async function deleteEvents(client: UkiClient, ids: readonly string[]): Promise<void> {
  await inChunks(ids, 100, async (chunk) => {
    const frames = must(
      await client.from("frames").select("storage_path").in("event_id", chunk),
      "frames of extra events",
    );
    await removeFrames(
      client,
      frames.map((row) => row.storage_path),
    );
    ok(await client.from("frames").delete().in("event_id", chunk), "delete frames of extra events");
    ok(await client.from("events").delete().in("id", chunk), "delete extra events");
  });
}

/** The whole term from scratch: what a cloud project seeded before seed v2 needs once. */
async function writeTerm(o: ApplyOptions, plan: TermPlan, staff: Staff): Promise<void> {
  const { client } = o;
  const ids = plan.exams.map((exam) => exam.id);
  for (const id of ids) await removeFrames(client, await listFramesUnder(client, id));
  // Children first: stills rows, flags, commands, then sessions (answers, decisions, reports and help
  // requests cascade), then the exams (rosters, groups and invites cascade).
  await inChunks(ids, 6, async (chunk) => {
    ok(await client.from("frames").delete().in("exam_id", chunk), "delete term frames");
    ok(await client.from("events").delete().in("exam_id", chunk), "delete term events");
    ok(await client.from("session_commands").delete().in("exam_id", chunk), "delete term commands");
    ok(await client.from("help_requests").delete().in("exam_id", chunk), "delete term help requests");
    ok(await client.from("sessions").delete().in("exam_id", chunk), "delete term sessions");
    ok(await client.from("exams").delete().in("id", chunk), "delete term exams");
  });
  const receipts = await freeReceipts(o, plan);
  await writeRows(
    client,
    "exams",
    plan.exams.map((exam) => ({
      id: exam.id,
      workspace_id: WORKSPACE_ID,
      faculty_id: FACULTY[exam.faculty],
      title: exam.title,
      course: exam.course,
      kind: exam.kind,
      code: null,
      mode: "app" as const,
      starts_at: exam.startsAt,
      duration_min: exam.durationMin,
      lobby_opens_at: iso(Date.parse(exam.startsAt) - 20 * MINUTE),
      status: "reviewed" as const,
      created_by: staff.dana,
      created_at: iso(Date.parse(exam.startsAt) - 9 * DAY),
      scheduled_at: iso(Date.parse(exam.startsAt) - 8 * DAY),
    })),
  );
  await writeRows(
    client,
    "exam_groups",
    plan.exams.flatMap((exam) => exam.groups.map((code) => ({ exam_id: exam.id, group_id: groupId(code) }))),
  );
  await writeRows(
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
  await writeRows(
    client,
    "sessions",
    plan.sessions.map((session) => ({
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
    })),
  );
  await writeRows(client, "events", eventRows(plan.events));
  await writeRows(client, "review_decisions", termDecisionRows(plan, staff));
}

async function applyTerm(o: ApplyOptions, plan: TermPlan, staff: Staff, report: StepReport[]): Promise<void> {
  const { client } = o;
  const state = await inspectTerm(o, plan, staff);
  const size = `${plan.exams.length} exams, ${plan.sessions.length} sessions, ${plan.events.length} flags, ${plan.decisions.length} decisions`;
  if (state.rebuild !== null) {
    if (!o.dryRun) await writeTerm(o, plan, staff);
    report.push({
      step: "Autumn 2026 term",
      detail: `${o.dryRun ? "would rebuild" : "rebuilt"} (${state.rebuild}): ${size}`,
    });
  } else {
    if (!o.dryRun) {
      if (state.statusWrong.length > 0) {
        ok(
          await client.from("exams").update({ status: "reviewed" }).in("id", state.statusWrong),
          "term status",
        );
      }
      await deleteEvents(client, state.extraEvents);
      await writeRows(client, "events", eventRows(state.missingEvents));
      await inChunks(state.extraDecisions, 100, async (chunk) => {
        ok(await client.from("review_decisions").delete().in("session_id", chunk), "delete extra decisions");
      });
      const wrong = new Set(state.wrongDecisions.map((decision) => decision.sessionId));
      await writeRows(
        client,
        "review_decisions",
        termDecisionRows(plan, staff).filter((row) => wrong.has(row.session_id)),
        { onConflict: "session_id" },
      );
    }
    const fixes = [
      state.statusWrong.length > 0 ? `${state.statusWrong.length} statuses` : "",
      state.missingEvents.length > 0 ? `${state.missingEvents.length} missing flags` : "",
      state.extraEvents.length > 0 ? `${state.extraEvents.length} added events` : "",
      state.wrongDecisions.length + state.extraDecisions.length > 0
        ? `${state.wrongDecisions.length + state.extraDecisions.length} decisions`
        : "",
    ].filter(Boolean);
    report.push({
      step: "Autumn 2026 term",
      detail: `in place (${size})${fixes.length > 0 ? `; ${o.dryRun ? "would fix" : "fixed"} ${fixes.join(", ")}` : ""}`,
    });
  }
  // The delete request's student's three flags keep a still each (A.5a: frames from two exams).
  const at = new Map(plan.events.map((event) => [event.id, event.at]));
  let put = 0;
  for (const still of deleteStudentStills(plan)) {
    if (await ensureStill(o, still, at.get(still.eventId) ?? iso(o.nowMs))) put += 1;
  }
  if (put > 0) {
    report.push({
      step: "delete request's stills",
      detail: `${put} of 3 ${o.dryRun ? "to put back" : "put back"}`,
    });
  }
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

/** The flag's still: the object, its frames row at `capturedAt`, and frame_count 1. True when it wrote. */
async function ensureStill(o: ApplyOptions, still: StillSeed, capturedAt: string): Promise<boolean> {
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
  if (!present) {
    const bytes = readFileSync(join(o.stillsDir ?? STILLS_DIR, still.file));
    const { error } = await o.client.storage
      .from(FRAMES_BUCKET)
      .upload(still.path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`storage upload ${still.path}: ${error.message}`);
  }
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
  const exam = must(await client.from("exams").select("status").eq("id", EXAM.history), "History")[0];
  if (!exam) throw new Error("History of Kazakhstan not found: load supabase/seed.sql first");
  const decisions = await client
    .from("review_decisions")
    .select("session_id", { count: "exact", head: true })
    .eq("exam_id", EXAM.history);
  if (decisions.error) throw new Error(`History decisions: ${decisions.error.message}`);
  const events = must(
    await client.from("events").select("id, at").eq("exam_id", EXAM.history),
    "History events",
  );
  const extra = events.filter((event) => !isHistorySeedEvent(event.id)).map((event) => event.id);
  const reports = must(
    await client.from("reports").select("id").eq("exam_id", EXAM.history),
    "History reports",
  );
  if (!o.dryRun) {
    ok(
      await client.from("review_decisions").delete().eq("exam_id", EXAM.history),
      "delete History decisions",
    );
    ok(await client.from("reports").delete().eq("exam_id", EXAM.history), "delete History reports");
    await deleteEvents(client, extra);
    ok(
      await client.from("exams").update({ status: "to_review" }).eq("id", EXAM.history),
      "History to_review",
    );
  }
  const at = new Map(events.map((event) => [event.id, event.at]));
  let stills = 0;
  for (const still of historyStills()) {
    const flagAt = at.get(still.eventId);
    if (!flagAt) throw new Error(`History flag ${still.eventId} is missing: load supabase/seed.sql again`);
    if (await ensureStill(o, still, flagAt)) stills += 1;
  }
  const verb = o.dryRun ? "would be cleared" : "cleared";
  report.push({
    step: "History of Kazakhstan",
    detail: `${decisions.count ?? 0} decisions, ${reports.length} reports and ${extra.length} added events ${verb}; status ${exam.status} -> to_review; ${stills} of 7 stills ${o.dryRun ? "to put back" : "put back"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Mathematics 2: invites and proctors
// ---------------------------------------------------------------------------------------------------

async function applyMath2(o: ApplyOptions, staff: Staff, report: StepReport[]): Promise<void> {
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
      .select("staff_id, confirmed_at, change_request")
      .eq("exam_id", EXAM.math2),
    "Mathematics 2 proctors",
  );
  const nurlan = assignments.find((row) => row.staff_id === staff.nurlan);
  const sentAt = iso(o.nowMs - INVITES_SENT_DAYS_AGO * DAY);
  if (!o.dryRun) {
    const stray = current.filter((row) => !want.has(row.student_id)).map((row) => row.student_id);
    if (stray.length > 0) {
      ok(
        await client.from("invites").delete().eq("exam_id", EXAM.math2).in("student_id", stray),
        "stray invites",
      );
    }
    await writeRows(
      client,
      "invites",
      invites.map((invite) => ({
        exam_id: invite.examId,
        student_id: invite.studentId,
        email: invite.email,
        locale: invite.locale,
        state: invite.state,
        provider_id: null,
        error: null,
        sent_at: sentAt,
      })),
      { onConflict: "exam_id,student_id" },
    );
    const proctors = new Set(MATH2_PROCTORS.map((row) => staff[row.staff]));
    const others = assignments.filter((row) => !proctors.has(row.staff_id)).map((row) => row.staff_id);
    if (others.length > 0) {
      ok(
        await client.from("proctor_assignments").delete().eq("exam_id", EXAM.math2).in("staff_id", others),
        "other proctors",
      );
    }
    await writeRows(
      client,
      "proctor_assignments",
      MATH2_PROCTORS.map((row) => ({
        exam_id: EXAM.math2,
        staff_id: staff[row.staff],
        seat_from: row.seatFrom,
        seat_to: row.seatTo,
        languages: row.languages,
        is_lead: row.isLead,
        confirmed_at: row.confirmed ? sentAt : null,
        change_request: null,
      })),
      { onConflict: "exam_id,staff_id" },
    );
  }
  const before = nurlan
    ? nurlan.change_request !== null
      ? "had asked for a change"
      : nurlan.confirmed_at !== null
        ? "had confirmed"
        : "was unconfirmed"
    : "had no assignment";
  report.push({
    step: "Mathematics 2",
    detail: `${invites.length} invites (Yerlan's bounced), ${changed} ${o.dryRun ? "to put back" : "put back"}; Nurlan's seats 65-128 unconfirmed (he ${before}), Aigerim's 1-64 confirmed`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Physics 1: the simulated student's open help request
// ---------------------------------------------------------------------------------------------------

async function applyPhysicsHelp(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  const exam = must(await client.from("exams").select("starts_at").eq("id", EXAM.physics1), "Physics 1")[0];
  if (!exam) throw new Error("Physics 1 not found: load supabase/seed.sql first");
  const requests = must(
    await client.from("help_requests").select("id, event_id, exam_id, done_at"),
    "help requests",
  );
  // Rehearsal requests on the seed's exams go; judge mode's DEMO-LIVE keeps its own.
  const others = requests.filter((row) => row.event_id !== PHYSICS_HELP.eventId && isSeedExamId(row.exam_id));
  const existing = requests.find((row) => row.event_id === PHYSICS_HELP.eventId);
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
        await client.from("students").select("locale").eq("id", PHYSICS_HELP.studentId),
        "help student",
      )[0];
      if (!student) throw new Error("the Physics 1 help student is missing");
      const minute = (m: number) => iso(start + m * MINUTE);
      // A finished session: the tile shows Done rather than No signal, and the request stays open.
      ok(
        await client.from("sessions").upsert(
          {
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
          },
          { onConflict: "id" },
        ),
        "help session",
      );
      // The help_from_event trigger makes the help_requests row and broadcasts `help` to the wall.
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
            received_at: iso(start + PHYSICS_HELP.askedMin * MINUTE + 1000),
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
  const state = existing ? (existing.done_at ? "reopened" : "open") : o.dryRun ? "to add" : "added";
  report.push({
    step: "Physics 1",
    detail: `the simulated student's help request ${state}; ${others.length} rehearsal help requests ${o.dryRun ? "would go" : "removed"}`,
  });
}

// ---------------------------------------------------------------------------------------------------
// Data requests (A.5)
// ---------------------------------------------------------------------------------------------------

async function backdateAudit(o: ApplyOptions, ids: readonly number[], at: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await o.client
    .from("audit_log")
    .update({ at })
    .in("id", [...ids]);
  if (error) o.log.warn(`audit rows keep the time of this run: ${error.message}`);
}

async function applyDataRequests(
  o: ApplyOptions,
  staff: Staff,
  plan: TermPlan,
  report: StepReport[],
): Promise<void> {
  const { client } = o;
  const rows = must(
    await client.from("data_requests").select("id, status").eq("workspace_id", WORKSPACE_ID),
    "data requests",
  );
  const seededIds: string[] = [DATA_REQUEST.delete.id, DATA_REQUEST.copy.id];
  const extra = rows.filter((row) => !seededIds.includes(row.id));
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
      const isNew = !rows.some((row) => row.id === request.id);
      ok(await client.from("data_requests").upsert(request, { onConflict: "id" }), "seeded data request");
      if (!isNew || request.id === undefined) continue;
      // A new row writes data_request.received now (the table's trigger); it happened when it arrived.
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
    // A privacy delete in rehearsal cleared the student's identity scores and device records (the
    // term step has put back their flags, and ensureStill their stills).
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

async function shareViews(client: UkiClient, shareId: string, sinceIso?: string): Promise<number[]> {
  let query = client
    .from("audit_log")
    .select("id")
    .eq("action", "report.share_view")
    .eq("meta->>share_id", shareId);
  if (sinceIso !== undefined) query = query.gte("at", sinceIso);
  return must(await query.order("id"), "share views").map((row) => row.id);
}

async function applySharedReport(o: ApplyOptions, report: StepReport[]): Promise<void> {
  const { client } = o;
  const reports = must(await client.from("reports").select("id, session_id, exam_id"), "reports").filter(
    (row) => isSeedExamId(row.exam_id),
  );
  const seeded = reports.find((row) => row.session_id === SHARED_REPORT.sessionId);
  const otherReports = reports.filter((row) => row.session_id !== SHARED_REPORT.sessionId);
  const shares = seeded
    ? must(
        await client
          .from("report_shares")
          .select("id, expires_at, revoked_at")
          .eq("report_id", seeded.id)
          .order("created_at"),
        "shares",
      )
    : [];
  const live = shares.filter(
    (share) => share.revoked_at === null && Date.parse(share.expires_at) > o.nowMs + DAY,
  );
  let healthy: string | null = null;
  for (const share of live) {
    if ((await shareViews(client, share.id)).length >= 2) healthy = share.id;
  }
  const staleShares = shares.filter((share) => share.id !== healthy).map((share) => share.id);
  if (!o.dryRun) {
    // Reports made in rehearsal go with their shares (report_shares cascade); audit rows stay.
    await inChunks(
      otherReports.map((row) => row.id),
      100,
      async (chunk) => {
        ok(await client.from("reports").delete().in("id", chunk), "delete rehearsal reports");
      },
    );
    await inChunks(staleShares, 100, async (chunk) => {
      ok(await client.from("report_shares").delete().in("id", chunk), "delete rehearsal shares");
    });
    if (healthy === null) await makeSharedReport(o);
  }
  report.push({
    step: "English B2 report",
    detail: `${healthy !== null ? "shared, 2 views: in place" : o.dryRun ? "to make, share and open twice" : "made with get_report, shared and opened twice"}; ${otherReports.length} other reports and ${staleShares.length} other shares ${o.dryRun ? "would go" : "removed"}`,
  });
}

async function makeSharedReport(o: ApplyOptions): Promise<void> {
  const { client } = o;
  const runStart = iso(o.nowMs - MINUTE);
  const dana = await staffClient(o.env, STAFF_EMAIL.dana);
  try {
    const payload = await dana.client.rpc("get_report", { session_id: SHARED_REPORT.sessionId });
    if (payload.error) throw new Error(`get_report: ${payload.error.message}`);
    const row = must(
      await client.from("reports").select("id").eq("session_id", SHARED_REPORT.sessionId),
      "the English B2 report",
    )[0];
    if (!row) throw new Error("get_report made no reports row");
    const shared = await dana.client.rpc("create_share", { report_id: row.id });
    if (shared.error) throw new Error(`create_share: ${shared.error.message}`);
    const share = shared.data as { share_id?: unknown; token?: unknown } | null;
    if (typeof share?.share_id !== "string" || typeof share.token !== "string") {
      throw new Error("create_share returned no token");
    }
    // Opened twice through the link, as the shared-report function does it: by the token's hash.
    const hash = createHash("sha256").update(share.token, "utf8").digest("hex");
    for (let view = 0; view < 2; view += 1) {
      const opened = await client.rpc("open_shared_report", { p_token_hash: hash });
      if (opened.error) throw new Error(`open_shared_report: ${opened.error.message}`);
    }
    // The story's times: made and shared two days ago, opened a day later and yesterday evening. The
    // link keeps the length create_share gave it.
    const sharedAt = o.nowMs - SHARED_REPORT.sharedHoursAgo * HOUR;
    const made = must(
      await client.from("report_shares").select("created_at, expires_at").eq("id", share.share_id),
      "the share",
    )[0];
    if (!made) throw new Error("create_share made no share row");
    const shift = sharedAt - Date.parse(made.created_at);
    ok(
      await client
        .from("report_shares")
        .update({ created_at: iso(sharedAt), expires_at: iso(Date.parse(made.expires_at) + shift) })
        .eq("id", share.share_id),
      "share times",
    );
    ok(
      await client
        .from("reports")
        .update({ created_at: iso(sharedAt - 10 * MINUTE), issued_at: iso(sharedAt - 10 * MINUTE) })
        .eq("id", row.id),
      "report time",
    );
    const viewed = must(
      await client
        .from("audit_log")
        .select("id")
        .eq("action", "report.view")
        .eq("meta->>report_id", row.id)
        .gte("at", runStart),
      "report view rows",
    );
    await backdateAudit(
      o,
      viewed.map((r) => r.id),
      iso(sharedAt - 10 * MINUTE),
    );
    const sharedRows = must(
      await client
        .from("audit_log")
        .select("id")
        .eq("action", "report.share")
        .eq("meta->>share_id", share.share_id),
      "share rows",
    );
    await backdateAudit(
      o,
      sharedRows.map((r) => r.id),
      iso(sharedAt),
    );
    const views = await shareViews(client, share.share_id, runStart);
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

async function applyOldExam(o: ApplyOptions, staff: Staff, report: StepReport[]): Promise<void> {
  const { client } = o;
  const plan: OldExamPlan = oldExamPlan(o.nowMs);
  const exam = must(
    await client.from("exams").select("id, starts_at").eq("id", OLD_EXAM_ID),
    "the old exam",
  )[0];
  const sessions = await client
    .from("sessions")
    .select("id", { count: "exact", head: true })
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

async function writeOldExam(o: ApplyOptions, plan: OldExamPlan, staff: Staff): Promise<void> {
  const { client } = o;
  const start = Date.parse(plan.exam.startsAt);
  await writeRows(client, "exams", [
    {
      id: plan.exam.id,
      workspace_id: WORKSPACE_ID,
      faculty_id: FACULTY.physics,
      title: plan.exam.title,
      course: plan.exam.course,
      kind: plan.exam.kind,
      mode: "app",
      starts_at: plan.exam.startsAt,
      duration_min: plan.exam.durationMin,
      lobby_opens_at: iso(start - 20 * MINUTE),
      status: "reviewed",
      created_by: staff.dana,
      created_at: iso(start - 14 * DAY),
      scheduled_at: iso(start - 13 * DAY),
    },
  ]);
  await writeRows(
    client,
    "exam_groups",
    plan.exam.groups.map((code) => ({ exam_id: plan.exam.id, group_id: groupByCode(code).id })),
  );
  await writeRows(
    client,
    "exam_students",
    plan.roster.map((row) => ({
      exam_id: plan.exam.id,
      student_id: row.studentId,
      seat: row.seat,
      invite_status: "sent",
    })),
  );
  await writeRows(
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
      joined_at: iso(start - 8 * MINUTE),
      rules_accepted_at: iso(start - 6 * MINUTE),
      rules_locale: session.locale,
      started_at: session.startedAt,
      submitted_at: session.submittedAt,
      time_used_s: session.timeUsedS,
      last_seen_at: session.submittedAt,
    })),
  );
  await writeRows(client, "events", [
    {
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
    },
  ]);
  await writeRows(client, "review_decisions", [
    {
      session_id: plan.flag.sessionId,
      exam_id: plan.exam.id,
      decision: "no_issue",
      note: "Phone on the desk, face down.",
      reviewer_id: staff.gulnara,
      decided_at: plan.decidedAt,
    },
  ]);
}

// ---------------------------------------------------------------------------------------------------
// Dana
// ---------------------------------------------------------------------------------------------------

async function applyDana(o: ApplyOptions, staff: Staff, report: StepReport[]): Promise<void> {
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
  if (o.env.SEED_STAFF_PASSWORD === undefined || o.env.SUPABASE_PUBLISHABLE_KEY === undefined) {
    throw new Error(
      "seed v2 makes the English B2 report as Dana (get_report): set SEED_STAFF_PASSWORD and SUPABASE_PUBLISHABLE_KEY",
    );
  }
  const report: StepReport[] = [];
  const staff = await staffIds(o.client);
  const plan = buildTermPlan();
  await deleteWizardExams(o, report);
  await applyWorld(o, report);
  await applyTerm(o, plan, staff, report);
  await applyOldExam(o, staff, report);
  await applyHistory(o, report);
  await applyMath2(o, staff, report);
  await applyPhysicsHelp(o, report);
  await applyDataRequests(o, staff, plan, report);
  await applySharedReport(o, report);
  await applyDana(o, staff, report);
  return report;
}

// `pnpm seed:check`: reads a seeded database and checks it against seed v2 (scripts/lib/seed-v2), row for
// row, then A.1's figures through the term_* views. Changes nothing. CI runs it after `supabase db reset`
// and `pnpm seed:staff` (seed.sql's SQL formulas against term.ts), and with --demo after each `pnpm
// demo:reset` (the story rows the reset writes, and that the reset left the term intact).
//
//   pnpm seed:check [--demo] [--env-file <path>]
//
// Prints one line per check and exits 1 when any fails. Values are never secrets: student data of the
// seeded demo world only.
import { z } from "zod";
import { FRAMES_BUCKET } from "../packages/contracts/src/index.ts";
import { createLogger, must, parseCli, style, UsageError } from "./lib/cli.ts";
import { serverClock } from "./lib/clock.ts";
import { DEMO_EXAMS } from "./lib/demo.ts";
import { describeTarget, loadEnvFile, readScriptEnv } from "./lib/env.ts";
import { REVIEWER_EMAIL } from "./lib/seed-v2/decisions.ts";
import {
  DATA_REQUEST,
  deleteStudentStills,
  EXAM,
  historyStills,
  MATH2_PROCTORS,
  math2Invites,
  OLD_EXAM_ID,
  OLD_STILL_DAYS,
  oldExamPlan,
  PHYSICS_HELP,
  SHARED_REPORT,
  type StillSeed,
} from "./lib/seed-v2/story.ts";
import { A1_FRAME, buildTermPlan, type Reviewer, TERM_KEY, type TermPlan } from "./lib/seed-v2/term.ts";
import { flagGroupShares, shares } from "./lib/seed-v2/term-stats.ts";
import { allStudents, BOUNCED_EMAIL, FACULTY, groupId, PEOPLE, WORKSPACE_ID } from "./lib/seed-v2/world.ts";
import { adminClient, type UkiClient } from "./lib/supabase.ts";

const log = createLogger("seed:check");

const USAGE = `Usage: pnpm seed:check [--demo] [--env-file <path>]

  --demo           also check what pnpm demo:reset writes (invites, stills, requests, the shared report)
  --env-file <p>   read SUPABASE_URL and SUPABASE_SECRET_KEY from this file instead of .env`;

const Args = z.object({
  demo: z.boolean().default(false),
  "env-file": z.string().optional(),
  help: z.boolean().default(false),
});

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
}

/** "3 differ: a, b, c" from a list of problems, or "" when there are none. */
function first(problems: readonly string[], n = 5): string {
  if (problems.length === 0) return "";
  return `${problems.length} differ: ${problems.slice(0, n).join("; ")}${problems.length > n ? "; …" : ""}`;
}

async function pages<T>(
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

const sameTime = (a: string | null | undefined, b: string) => a != null && Date.parse(a) === Date.parse(b);

/** JSON with object keys sorted: jsonb keeps its own key order, so two equal objects may print apart. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------------------------------
// The world and the term, row for row
// ---------------------------------------------------------------------------------------------------

async function checkStudents(client: UkiClient): Promise<void> {
  const want = allStudents();
  const rows = await pages("students", (from, to) =>
    client
      .from("students")
      .select("id, student_number, full_name, email, group_id, locale, programme, year")
      .eq("workspace_id", WORKSPACE_ID)
      .order("id")
      .range(from, to),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const student of want) {
    const row = byId.get(student.id);
    if (!row) {
      problems.push(`${student.number} missing`);
      continue;
    }
    const diffs = [
      row.student_number !== student.number ? "number" : "",
      row.full_name !== student.fullName ? `name ${row.full_name}` : "",
      row.email !== student.email ? `email ${row.email}` : "",
      row.group_id !== groupId(student.groupCode) ? "group" : "",
      row.locale !== student.locale ? "locale" : "",
      row.programme !== student.programme ? `programme ${row.programme}` : "",
      row.year !== student.year ? `year ${row.year}` : "",
    ].filter(Boolean);
    if (diffs.length > 0) problems.push(`${student.number} ${diffs.join(", ")}`);
  }
  const seededIds = new Set(want.map((student) => student.id));
  const inJudgeRange = rows.filter((row) => seededIds.has(row.id) && /^20249\d{3}$/.test(row.student_number));
  check(
    "students",
    problems.length === 0,
    first(problems) || `${want.length} seeded, each with programme and year as world.ts says`,
  );
  check(
    "no seeded student in 20249xxx",
    inJudgeRange.length === 0,
    `${inJudgeRange.length} (judge mode's DEMO roster is 20249001 to 20249030)`,
  );
}

async function checkTerm(client: UkiClient, plan: TermPlan): Promise<void> {
  const ids = plan.exams.map((exam) => exam.id);
  const exams = must(
    await client
      .from("exams")
      .select("id, title, course, kind, faculty_id, starts_at, duration_min, status, mode")
      .in("id", ids),
    "term exams",
  );
  const examById = new Map(exams.map((row) => [row.id, row]));
  const examProblems = plan.exams.flatMap((exam) => {
    const row = examById.get(exam.id);
    if (!row) return [`${exam.title} missing`];
    const ok =
      row.title === exam.title &&
      row.faculty_id === FACULTY[exam.faculty] &&
      sameTime(row.starts_at, exam.startsAt) &&
      row.duration_min === exam.durationMin &&
      row.status === "reviewed" &&
      row.mode === "app";
    return ok ? [] : [`${exam.title} (${exam.startsAt}) as ${row.title}, ${row.status}, ${row.starts_at}`];
  });
  check(
    "term exams",
    examProblems.length === 0,
    first(examProblems) || `${plan.exams.length} reviewed exams`,
  );

  const roster = await pages("term roster", (from, to) =>
    client
      .from("exam_students")
      .select("exam_id, student_id, seat")
      .in("exam_id", ids)
      .order("exam_id")
      .order("seat")
      .range(from, to),
  );
  const seat = new Map(roster.map((row) => [`${row.exam_id}/${row.student_id}`, row.seat]));
  const rosterProblems = plan.roster.flatMap((row) =>
    seat.get(`${row.examId}/${row.studentId}`) === row.seat
      ? []
      : [`${row.examId.slice(-2)}/${row.studentId.slice(-8)}`],
  );
  check(
    "term rosters",
    rosterProblems.length === 0 && roster.length === plan.roster.length,
    first(rosterProblems) || `${roster.length} of ${plan.roster.length} seats`,
  );

  const sessions = await pages("term sessions", (from, to) =>
    client
      .from("sessions")
      .select(
        "id, student_id, state, locale, device, identity_score, joined_at, rules_accepted_at, rules_locale, started_at, submitted_at, time_used_s, receipt_id",
      )
      .in("exam_id", ids)
      .order("id")
      .range(from, to),
  );
  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  const sessionProblems: string[] = [];
  const receipts = new Set<string>();
  for (const session of plan.sessions) {
    const row = sessionById.get(session.id);
    if (!row) {
      sessionProblems.push(`${session.id} missing`);
      continue;
    }
    const os = (row.device as { os?: unknown } | null)?.os;
    const diffs = [
      row.student_id !== session.studentId ? "student" : "",
      row.state !== session.state ? `state ${row.state}` : "",
      row.locale !== session.locale ? "locale" : "",
      os !== session.os ? `os ${String(os)}` : "",
      Number(row.identity_score) !== session.identityScore ? `identity ${row.identity_score}` : "",
      !sameTime(row.joined_at, session.joinedAt) ? `joined ${row.joined_at}` : "",
      !sameTime(row.rules_accepted_at, session.rulesAcceptedAt) ? `rules ${row.rules_accepted_at}` : "",
      row.rules_locale !== session.locale ? "rules locale" : "",
      !sameTime(row.started_at, session.startedAt) ? `started ${row.started_at}` : "",
      !sameTime(row.submitted_at, session.submittedAt) ? `submitted ${row.submitted_at}` : "",
      row.time_used_s !== session.timeUsedS ? `used ${row.time_used_s}` : "",
      row.receipt_id === null || !/^UKI-[0-9]{3}-[0-9]{4}-[A-Z]{2}$/.test(row.receipt_id)
        ? `receipt ${row.receipt_id}`
        : "",
    ].filter(Boolean);
    if (row.receipt_id !== null) receipts.add(row.receipt_id);
    if (diffs.length > 0)
      sessionProblems.push(`${session.number} in exam ${session.examId.slice(-2)}: ${diffs.join(", ")}`);
  }
  check(
    "term sessions",
    sessionProblems.length === 0 && sessions.length === plan.sessions.length,
    first(sessionProblems) ||
      `${sessions.length} of ${plan.sessions.length}, times, devices and identity as term.ts`,
  );
  check("term receipts", receipts.size === plan.sessions.length, `${receipts.size} distinct receipt ids`);

  const events = await pages("term events", (from, to) =>
    client
      .from("events")
      .select("id, session_id, type, source, review, seq, at, received_at, data")
      .in("exam_id", ids)
      .order("id")
      .range(from, to),
  );
  const eventById = new Map(events.map((row) => [row.id, row]));
  const eventProblems = plan.events.flatMap((event) => {
    const row = eventById.get(event.id);
    if (!row) return [`${event.id} missing`];
    const ok =
      row.session_id === event.sessionId &&
      row.type === event.type &&
      row.review === "flag" &&
      row.seq === event.seq &&
      sameTime(row.at, event.at) &&
      sameTime(row.received_at, event.receivedAt) &&
      canonical(row.data) === canonical(event.data);
    return ok ? [] : [`${event.id}`];
  });
  check(
    "term flags",
    eventProblems.length === 0 && events.length === plan.events.length,
    first(eventProblems) || `${events.length} of ${plan.events.length}`,
  );

  const reviewers = new Map<string, Reviewer>();
  const users = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(`listing users: ${users.error.message}`);
  for (const [key, email] of Object.entries(REVIEWER_EMAIL) as [Reviewer, string][]) {
    const user = users.data.users.find((row) => row.email?.toLowerCase() === email);
    if (user) reviewers.set(user.id, key);
  }
  const decisions = await pages("term decisions", (from, to) =>
    client
      .from("review_decisions")
      .select("session_id, decision, note, reviewer_id, decided_at")
      .in("exam_id", ids)
      .order("session_id")
      .range(from, to),
  );
  const decisionBySession = new Map(decisions.map((row) => [row.session_id, row]));
  const decisionProblems = plan.decisions.flatMap((decision) => {
    const row = decisionBySession.get(decision.sessionId);
    if (!row) return [`${decision.sessionId} undecided`];
    const ok =
      row.decision === decision.decision &&
      row.note === decision.note &&
      reviewers.get(row.reviewer_id) === decision.reviewer &&
      sameTime(row.decided_at, decision.decidedAt);
    return ok ? [] : [`${decision.sessionId}`];
  });
  check(
    "term decisions",
    decisionProblems.length === 0 && decisions.length === plan.decisions.length,
    first(decisionProblems) || `${decisions.length} of ${plan.decisions.length}, by the staff term.ts names`,
  );
}

// ---------------------------------------------------------------------------------------------------
// A.1's figures from the views
// ---------------------------------------------------------------------------------------------------

async function checkA1(client: UkiClient): Promise<void> {
  const math = FACULTY.mathematics;
  // Exams outside seed v2 that A.1 counts for the faculty: any that ran and is not one of the term's.
  // Judge mode's DEMO-LIVE is the likely one (live, in the Faculty of Mathematics): A.1 then shows it too.
  const term = new Set(buildTermPlan().exams.map((exam) => exam.id));
  const others = must(
    await client
      .from("exams")
      .select("id, code, title")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("faculty_id", math)
      .in("status", ["live", "to_review", "reviewed"]),
    "exams that ran",
  ).filter((exam) => !term.has(exam.id));
  if (others.length > 0) {
    check(
      "A.1 counts only the term",
      false,
      `also counted for the Faculty of Mathematics: ${others.map((exam) => exam.code ?? exam.title).join(", ")}; A.1 shows them with the term`,
    );
  }
  const kpi = must(
    await client
      .from("term_kpis")
      .select("exams_run, sessions, flags, flagged_sessions, decisions, committee, first_day")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("term", TERM_KEY)
      .eq("faculty_id", math),
    "term_kpis",
  )[0];
  check(
    "A.1 tiles",
    kpi !== undefined &&
      kpi.exams_run === A1_FRAME.examsRun &&
      kpi.sessions === A1_FRAME.sessions &&
      kpi.committee === A1_FRAME.committee &&
      kpi.first_day === A1_FRAME.firstDay &&
      kpi.flagged_sessions === A1_FRAME.flaggedSessions &&
      Math.round((kpi.committee * 1000) / kpi.sessions) / 10 === A1_FRAME.committeePercent,
    kpi
      ? `${kpi.exams_run} exams since ${kpi.first_day}, ${kpi.sessions} sessions, ${kpi.committee} to the committee, ${kpi.flagged_sessions} flagged`
      : "no Mathematics row",
  );
  const weekly = must(
    await client
      .from("term_weekly_flags")
      .select("week_start, sessions, flags, flags_per_100")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("term", TERM_KEY)
      .eq("faculty_id", math)
      .order("week_start"),
    "term_weekly_flags",
  );
  const rates = weekly.map((row) => ({ week: row.week_start, rate: Number(row.flags_per_100) }));
  const september = weekly.slice(0, 4);
  const septemberRate =
    Math.round(
      (september.reduce((sum, row) => sum + (row.flags ?? 0), 0) * 1000) /
        Math.max(
          1,
          september.reduce((sum, row) => sum + (row.sessions ?? 0), 0),
        ),
    ) / 10;
  check(
    "A.1 flags per 100, weekly",
    JSON.stringify(rates) === JSON.stringify(A1_FRAME.weekly) &&
      septemberRate === A1_FRAME.flagsPer100September,
    `${rates.map((row) => row.rate).join(", ")}; September ${septemberRate}`,
  );
  const types = must(
    await client
      .from("term_flag_types")
      .select("type, flags")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("term", TERM_KEY)
      .eq("faculty_id", math),
    "term_flag_types",
  );
  const groupShares = flagGroupShares(Object.fromEntries(types.map((row) => [row.type, row.flags])));
  check(
    "A.1 what gets flagged",
    JSON.stringify(groupShares) === JSON.stringify(A1_FRAME.flagShares),
    Object.entries(groupShares)
      .map(([group, share]) => `${group} ${share}%`)
      .join(", "),
  );
  const decisions = must(
    await client
      .from("term_decisions")
      .select("decision, sessions")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("term", TERM_KEY)
      .eq("faculty_id", math),
    "term_decisions",
  );
  const count = (decision: string) => decisions.find((row) => row.decision === decision)?.sessions ?? 0;
  const counts = { no_issue: count("no_issue"), talk: count("talk"), committee: count("committee") };
  check(
    "A.1 decisions",
    JSON.stringify(counts) === JSON.stringify(A1_FRAME.decisions) &&
      JSON.stringify(shares([counts.no_issue, counts.talk, counts.committee])) ===
        JSON.stringify(Object.values(A1_FRAME.decisionShares)),
    `${counts.no_issue}, ${counts.talk} and ${counts.committee}`,
  );
  const review = must(
    await client
      .from("term_review_time")
      .select("week_start, median_review_s")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("term", TERM_KEY)
      .eq("faculty_id", math)
      .order("week_start"),
    "term_review_time",
  );
  const medians = review.map((row) => row.median_review_s);
  check(
    "A.1 median review time",
    JSON.stringify(medians) === JSON.stringify(A1_FRAME.medianReviewS),
    medians
      .map(
        (s) =>
          `${Math.floor((s ?? 0) / 3600)}:${String(Math.round(((s ?? 0) % 3600) / 60)).padStart(2, "0")}`,
      )
      .join(", "),
  );
}

// ---------------------------------------------------------------------------------------------------
// What demo:reset writes
// ---------------------------------------------------------------------------------------------------

async function objectExists(client: UkiClient, path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(FRAMES_BUCKET).list(folder, { search: name, limit: 10 });
  if (error) throw new Error(`storage list ${folder}: ${error.message}`);
  return data.some((entry) => entry.name === name);
}

async function checkStills(client: UkiClient, name: string, stills: readonly StillSeed[]): Promise<void> {
  const problems: string[] = [];
  for (const still of stills) {
    const rows = must(
      await client.from("frames").select("storage_path").eq("event_id", still.eventId),
      "frames",
    );
    if (!rows.some((row) => row.storage_path === still.path))
      problems.push(`${still.eventId} has no frames row`);
    else if (!(await objectExists(client, still.path))) problems.push(`${still.path} is not in Storage`);
  }
  check(name, problems.length === 0, first(problems) || `${stills.length} stills, rows and objects`);
}

async function checkDemo(client: UkiClient, plan: TermPlan, nowMs: number): Promise<void> {
  const exams = must(
    await client
      .from("exams")
      .select("id, code, status")
      .in("code", [DEMO_EXAMS.math.code, DEMO_EXAMS.physics.code]),
    "demo exams",
  );
  const status = (code: string) => exams.find((row) => row.code === code)?.status;
  check(
    "demo exams",
    status(DEMO_EXAMS.math.code) === "scheduled" && status(DEMO_EXAMS.physics.code) === "live",
    `Mathematics 2 ${status(DEMO_EXAMS.math.code)}, Physics 1 ${status(DEMO_EXAMS.physics.code)}`,
  );

  const invites = must(
    await client.from("invites").select("student_id, email, state").eq("exam_id", EXAM.math2),
    "invites",
  );
  const want = math2Invites();
  const inviteProblems = want.flatMap((invite) => {
    const row = invites.find((r) => r.student_id === invite.studentId);
    return row && row.email === invite.email && row.state === invite.state
      ? []
      : [invite.studentId.slice(-8)];
  });
  const yerlan = must(
    await client
      .from("exam_students")
      .select("invite_status, students!inner(student_number)")
      .eq("exam_id", EXAM.math2)
      .eq("students.student_number", PEOPLE.yerlan),
    "Yerlan's seat",
  )[0];
  check(
    "Mathematics 2 invites",
    inviteProblems.length === 0 && invites.length === want.length && yerlan?.invite_status === "bounced",
    first(inviteProblems) || `${invites.length} sent, Yerlan's bounced at ${BOUNCED_EMAIL}`,
  );

  const assignments = must(
    await client
      .from("proctor_assignments")
      .select("seat_from, seat_to, confirmed_at, change_request, is_lead")
      .eq("exam_id", EXAM.math2)
      .order("seat_from"),
    "proctors",
  );
  const nurlan = assignments.find((row) => row.seat_from === 65 && row.seat_to === 128);
  const aigerim = assignments.find((row) => row.seat_from === 1 && row.seat_to === 64);
  check(
    "Nurlan's seats",
    assignments.length === MATH2_PROCTORS.length &&
      nurlan?.confirmed_at === null &&
      nurlan.change_request === null &&
      aigerim?.confirmed_at !== null,
    `65-128 ${nurlan?.confirmed_at === null ? "unconfirmed" : "confirmed"}, 1-64 ${aigerim?.confirmed_at ? "confirmed" : "unconfirmed"}`,
  );

  const history = must(await client.from("exams").select("status").eq("id", EXAM.history), "History")[0];
  const historyDecisions = await client
    .from("review_decisions")
    .select("session_id", { count: "exact", head: true })
    .eq("exam_id", EXAM.history);
  const historyFlags = await client
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", EXAM.history)
    .eq("review", "flag");
  check(
    "History of Kazakhstan",
    history?.status === "to_review" && historyDecisions.count === 0 && historyFlags.count === 7,
    `${history?.status}, ${historyFlags.count} flags, ${historyDecisions.count} decisions`,
  );
  await checkStills(client, "History's stills", historyStills());
  await checkStills(client, "the delete request's stills", deleteStudentStills(plan));

  const help = must(
    await client.from("help_requests").select("done_at, topic, exam_id").eq("event_id", PHYSICS_HELP.eventId),
    "help request",
  )[0];
  check(
    "Physics 1 help request",
    help !== undefined && help.done_at === null && help.exam_id === EXAM.physics1,
    help ? `open, ${help.topic}` : "missing",
  );

  const requests = must(
    await client
      .from("data_requests")
      .select("id, kind, status, received_at")
      .eq("workspace_id", WORKSPACE_ID),
    "data requests",
  );
  const del = requests.find((row) => row.id === DATA_REQUEST.delete.id);
  const copy = requests.find((row) => row.id === DATA_REQUEST.copy.id);
  const ageDays = (at: string | undefined) => (at ? Math.round((nowMs - Date.parse(at)) / 86_400_000) : null);
  check(
    "data requests",
    del?.status === "received" &&
      ageDays(del.received_at) === DATA_REQUEST.delete.receivedDaysAgo &&
      copy?.status === "done" &&
      requests.length === 2,
    `delete ${del?.status} ${ageDays(del?.received_at)} days ago, copy ${copy?.status}; ${requests.length} in all`,
  );

  const report = must(
    await client.from("reports").select("id, verify_code").eq("session_id", SHARED_REPORT.sessionId),
    "the English B2 report",
  )[0];
  const share = report
    ? must(
        await client
          .from("report_shares")
          .select("id, expires_at, revoked_at")
          .eq("report_id", report.id)
          .is("revoked_at", null),
        "shares",
      ).find((row) => Date.parse(row.expires_at) > nowMs)
    : undefined;
  const views = share
    ? must(
        await client
          .from("audit_log")
          .select("id")
          .eq("action", "report.share_view")
          .eq("meta->>share_id", share.id),
        "share views",
      ).length
    : 0;
  check(
    "English B2 report",
    report !== undefined && share !== undefined && views >= 2,
    report ? `verify code ${report.verify_code}, shared, ${views} views in the audit log` : "missing",
  );

  const old = oldExamPlan(nowMs);
  const oldFrame = must(
    await client.from("frames").select("captured_at, storage_path").eq("event_id", old.flag.id),
    "old still",
  )[0];
  const almatyDay = (ms: number) => new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10);
  const days = oldFrame
    ? Math.round(
        (Date.parse(`${almatyDay(nowMs)}T00:00:00Z`) -
          Date.parse(`${almatyDay(Date.parse(oldFrame.captured_at))}T00:00:00Z`)) /
          86_400_000,
      )
    : null;
  check(
    "the still 91 days old",
    oldFrame !== undefined && days === OLD_STILL_DAYS && (await objectExists(client, oldFrame.storage_path)),
    oldFrame
      ? `${old.exam.title}, captured ${days} days ago (Almaty), exam ${OLD_EXAM_ID.slice(-4)}`
      : "missing",
  );

  const dana = must(
    await client.from("staff").select("languages, full_name").eq("full_name", "Dana Akhmetova"),
    "Dana",
  )[0];
  check("Dana's languages", dana?.languages[0] === "en", JSON.stringify(dana?.languages ?? null));
}

async function main(): Promise<number> {
  const args = parseCli(
    process.argv.slice(2),
    { demo: { type: "boolean" }, "env-file": { type: "string" }, help: { type: "boolean", short: "h" } },
    Args,
  );
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  loadEnvFile(args["env-file"]);
  const env = readScriptEnv();
  log.info(`reading the ${style.bold(describeTarget(env.SUPABASE_URL))}${args.demo ? " (with --demo)" : ""}`);
  const client = adminClient(env);
  const clock = await serverClock(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  const plan = buildTermPlan();
  await checkStudents(client);
  await checkTerm(client, plan);
  await checkA1(client);
  if (args.demo) await checkDemo(client, plan, clock.now());
  for (const result of results) {
    const mark = result.ok ? style.green("ok  ") : style.red("FAIL");
    log.info(`${mark} ${result.name}: ${result.detail}`);
  }
  const failed = results.filter((result) => !result.ok).length;
  if (failed > 0) {
    log.error(`${failed} of ${results.length} checks failed`);
    return 1;
  }
  log.info(style.green(`all ${results.length} checks passed`));
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof UsageError) {
      log.error(error.message);
      process.stderr.write(`${USAGE}\n`);
      process.exit(2);
    }
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

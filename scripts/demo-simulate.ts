// `pnpm demo:simulate`: fills the Mathematics 2 lobby (1.5) and live wall (2.4) with simulated
// students, as in "Demo script and seed data" (docs/phase-0-plan.md), on the local stack or the cloud
// project. The presenter says on stage that these tiles are simulated; each simulated session carries
// `device.simulated = true`.
//
// Before the start, simulated students join over 45 s and walk through the check-in; three get stuck
// (Telegram open, camera busy, card unreadable). When the exam starts (Start exam on the dashboard,
// the clock, or --start-after), they open 2.1, answer questions, and play the wall's moments: looks
// away, a tab blocked, a second face, a phone at 0.94, an empty seat and a lost camera that pause,
// a student whose heartbeats stop (No signal), and two early submissions. Proctor commands to
// simulated students are acknowledged and their effects followed. Writes use the secret key: see
// scripts/lib/sim/engine.ts for each path. Madina's number (20231187) is skipped by default because
// her real MacBook joins in the demo.
//
//   pnpm demo:simulate [--sessions 120] [--speed 1] [--seconds N] [--start-after N] [--watch] ...
//
// Ctrl+C stops cleanly (a second Ctrl+C quits at once). Simulated sessions stay until `pnpm
// demo:reset`, or are removed on exit with --cleanup.
import { z } from "zod";
import {
  ExamChecks,
  type ExamChecks as ExamChecksType,
  isFinalState,
  Locale,
  matchErrorCode,
  SessionState,
  SessionStatus,
  START_ERROR_CODES,
} from "../packages/contracts/src/index.ts";
import {
  almatyTime,
  createLogger,
  formatDuration,
  must,
  numberFlag,
  ok,
  parseCli,
  style,
  UsageError,
} from "./lib/cli.ts";
import { serverClock } from "./lib/clock.ts";
import { DEMO_EXAMS } from "./lib/demo.ts";
import { describeTarget, loadEnvFile, readScriptEnv, type ScriptEnv } from "./lib/env.ts";
import { NAMED_PARTS, planCast, type RosterEntry } from "./lib/sim/cast.ts";
import { type AdoptedSession, SimEngine, type SimExam, type SimQuestion } from "./lib/sim/engine.ts";
import { BroadcastWatch } from "./lib/sim/watch.ts";
import { adminClient, staffClient, type UkiClient } from "./lib/supabase.ts";

const log = createLogger("demo:simulate");

const USAGE = `Usage: pnpm demo:simulate [options]

  --sessions <n>       simulated students, 1 to 128 (default 120)
  --speed <x>          script speed, 0.1 to 60 (default 1); heartbeats and No signal stay real time
  --seconds <n>        stop after n seconds (default: run until the exam is over or Ctrl+C)
  --exam <code>        exam code (default ${DEMO_EXAMS.math.code})
  --skip <numbers>     comma-separated student numbers never simulated (default 20231187, the real
                       MacBook); pass --skip "" to simulate Madina too
  --start-after <n>    start the exam n seconds from now as the exam office (start_exam); needs
                       SEED_STAFF_PASSWORD and SUPABASE_PUBLISHABLE_KEY
  --start-as <email>   who starts the exam (default dana.akhmetova@kru.test)
  --watch              listen on exam:{id} as a proctor and report send-to-broadcast latency
  --watch-as <email>   who listens (default aigerim.sadykova@kru.test)
  --heartbeat <s>      seconds between ingest calls per student, 2 to 10 (default 8)
  --concurrency <n>    calls in flight at once, 1 to 64 (default 8)
  --seed <n>           random seed for the script (default 1)
  --cleanup            delete the simulated sessions and their rows on exit
  --verbose            log every join, step and question
  --env-file <path>    read SUPABASE_URL and SUPABASE_SECRET_KEY from this file instead of .env`;

const Args = z.object({
  sessions: numberFlag(1, 128, 120),
  speed: numberFlag(0.1, 60, 1),
  seconds: numberFlag(1, 24 * 3600, 0),
  exam: z.string().default(DEMO_EXAMS.math.code),
  skip: z.string().default("20231187"),
  "start-after": z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 3600) {
        ctx.addIssue({ code: "custom", message: `expected 0 to 3600 seconds, got "${value}"` });
        return z.NEVER;
      }
      return n;
    }),
  "start-as": z.email().default("dana.akhmetova@kru.test"),
  watch: z.boolean().default(false),
  "watch-as": z.email().default("aigerim.sadykova@kru.test"),
  heartbeat: numberFlag(2, 10, 8),
  concurrency: numberFlag(1, 64, 8),
  seed: numberFlag(0, 2 ** 31, 1),
  cleanup: z.boolean().default(false),
  verbose: z.boolean().default(false),
  "env-file": z.string().optional(),
  help: z.boolean().default(false),
});
type Args = z.infer<typeof Args>;

const ExamRow = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  mode: z.string(),
  status: z.string(),
  starts_at: z.string(),
  lobby_opens_at: z.string(),
  duration_min: z.number().int().positive(),
  checks: z.unknown(),
});

const QuestionRow = z.object({
  position: z.number().int(),
  question_id: z.uuid(),
  questions: z.object({ choices: z.array(z.object({ id: z.string().min(1) })).min(1) }),
});

const RosterRow = z.object({
  seat: z.number().int().nullable(),
  student_id: z.uuid(),
  students: z.object({ full_name: z.string(), student_number: z.string(), locale: Locale }),
});

const SessionRow = z.object({
  id: z.uuid(),
  student_id: z.uuid(),
  state: SessionState,
  status: SessionStatus.nullable().catch({}),
  device: z.unknown(),
});

function isSimulated(device: unknown): boolean {
  return (
    typeof device === "object" && device !== null && (device as Record<string, unknown>).simulated === true
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadExam(
  client: UkiClient,
  code: string,
): Promise<SimExam & { mode: string; lobbyOpensAtMs: number }> {
  const rows = must(
    await client
      .from("exams")
      .select("id, code, title, mode, status, starts_at, lobby_opens_at, duration_min, checks")
      .eq("code", code.trim().toUpperCase()),
    "exam",
  );
  const first = rows[0];
  if (first === undefined)
    throw new Error(`exam ${code} not found: load supabase/seed.sql, then pnpm demo:reset`);
  const row = ExamRow.parse(first);
  const checks: ExamChecksType = ExamChecks.parse(row.checks ?? {});
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    mode: row.mode,
    status: row.status,
    startsAtMs: Date.parse(row.starts_at),
    lobbyOpensAtMs: Date.parse(row.lobby_opens_at),
    durationMin: row.duration_min,
    checks,
  };
}

async function loadQuestions(client: UkiClient, examId: string): Promise<SimQuestion[]> {
  const rows = must(
    await client
      .from("exam_questions")
      .select("position, question_id, questions(choices)")
      .eq("exam_id", examId)
      .order("position"),
    "exam questions",
  );
  return z
    .array(QuestionRow)
    .parse(rows)
    .map((row) => ({ id: row.question_id, choiceIds: row.questions.choices.map((choice) => choice.id) }));
}

async function loadRoster(client: UkiClient, examId: string): Promise<RosterEntry[]> {
  const rows = must(
    await client
      .from("exam_students")
      .select("seat, student_id, students(full_name, student_number, locale)")
      .eq("exam_id", examId)
      .order("seat"),
    "roster",
  );
  return z
    .array(RosterRow)
    .parse(rows)
    .map((row) => ({
      studentId: row.student_id,
      seat: row.seat,
      number: row.students.student_number,
      name: row.students.full_name,
      locale: row.students.locale,
    }));
}

async function lastSeq(client: UkiClient, sessionId: string): Promise<number> {
  const rows = must(
    await client
      .from("events")
      .select("seq")
      .eq("session_id", sessionId)
      .not("seq", "is", null)
      .order("seq", { ascending: false })
      .limit(1),
    "last seq",
  );
  return rows[0]?.seq ?? 0;
}

/** True when the latest pause of a session is the student's own (session.paused, not by a proctor). */
async function pausedBySelf(client: UkiClient, sessionId: string): Promise<boolean> {
  const rows = must(
    await client
      .from("events")
      .select("type, data")
      .eq("session_id", sessionId)
      .in("type", ["session.paused", "proctor.paused"])
      .order("received_at", { ascending: false })
      .limit(1),
    "latest pause",
  );
  const latest = rows[0];
  if (latest === undefined || latest.type !== "session.paused") return false;
  const data = latest.data;
  return !(typeof data === "object" && data !== null && !Array.isArray(data) && data.reason === "proctor");
}

async function startExam(env: ScriptEnv, examId: string, as: string): Promise<void> {
  const { client } = await staffClient(env, as);
  const { data, error } = await client.rpc("start_exam", { exam_id: examId });
  if (error) {
    const code = matchErrorCode(error, START_ERROR_CODES);
    if (code === "already_started") log.info("start_exam: the exam had already started");
    else log.warn(`start_exam as ${as} failed: ${code ?? error.message}`);
  } else {
    log.info(`start_exam as ${as}: started at ${JSON.stringify(data)}`);
  }
  await client.auth.signOut();
}

async function cleanup(client: UkiClient, sessionIds: readonly string[]): Promise<void> {
  for (let i = 0; i < sessionIds.length; i += 100) {
    const chunk = sessionIds.slice(i, i + 100);
    ok(await client.from("events").delete().in("session_id", chunk), "delete simulated events");
    ok(await client.from("session_commands").delete().in("session_id", chunk), "delete simulated commands");
    ok(await client.from("answers").delete().in("session_id", chunk), "delete simulated answers");
    ok(await client.from("sessions").delete().in("id", chunk), "delete simulated sessions");
  }
  log.info(`removed ${sessionIds.length} simulated sessions and their rows`);
}

/** Resolves to the exit code: 1 when --watch saw a broadcast fail its contract, go missing, or none at all. */
async function main(): Promise<number> {
  const args: Args = parseCli(
    process.argv.slice(2),
    {
      sessions: { type: "string", short: "n" },
      speed: { type: "string" },
      seconds: { type: "string" },
      exam: { type: "string" },
      skip: { type: "string" },
      "start-after": { type: "string" },
      "start-as": { type: "string" },
      watch: { type: "boolean" },
      "watch-as": { type: "string" },
      heartbeat: { type: "string" },
      concurrency: { type: "string" },
      seed: { type: "string" },
      cleanup: { type: "boolean" },
      verbose: { type: "boolean", short: "v" },
      "env-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    Args,
  );
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  loadEnvFile(args["env-file"]);
  const env = readScriptEnv();
  const client = adminClient(env);
  const clock = await serverClock(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  log.info(`simulating on the ${style.bold(describeTarget(env.SUPABASE_URL))}`);

  // Stop on Ctrl+C, SIGTERM or --seconds; a second Ctrl+C quits at once.
  let stopRequested = false;
  let stopReason = "";
  const requestStop = (reason: string) => {
    if (stopRequested) {
      log.warn("stopping now");
      process.exit(130);
    }
    stopRequested = true;
    stopReason = reason;
  };
  process.on("SIGINT", () => requestStop("Ctrl+C"));
  process.on("SIGTERM", () => requestStop("SIGTERM"));
  const launchedAt = Date.now();
  if (args.seconds > 0)
    setTimeout(() => requestStop(`${args.seconds} s elapsed`), args.seconds * 1000).unref();

  const exam = await loadExam(client, args.exam);
  if (exam.mode !== "app") log.warn(`${exam.title} is a ${exam.mode} exam; the simulator plays the app path`);
  if (["draft", "cancelled", "reviewed"].includes(exam.status)) {
    throw new Error(`${exam.title} is ${exam.status}; run pnpm demo:reset first`);
  }
  const endMs = exam.startsAtMs + exam.durationMin * 60_000;
  if (clock.now() >= endMs || exam.status === "to_review") {
    throw new Error(`${exam.title} ended at ${almatyTime(endMs)} Almaty; run pnpm demo:reset first`);
  }

  const questions = await loadQuestions(client, exam.id);
  if (questions.length === 0) throw new Error(`${exam.title} has no questions`);
  const roster = await loadRoster(client, exam.id);
  const sessions = z
    .array(SessionRow)
    .parse(
      must(
        await client.from("sessions").select("id, student_id, state, status, device").eq("exam_id", exam.id),
        "sessions",
      ),
    );
  const real = sessions.filter((row) => !isSimulated(row.device));
  const simulated = new Map(
    sessions.filter((row) => isSimulated(row.device)).map((row) => [row.student_id, row]),
  );
  const skip = new Set(
    args.skip
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const cast = planCast(roster, {
    count: args.sessions,
    skipNumbers: skip,
    takenStudentIds: new Set(real.map((row) => row.student_id)),
    seed: args.seed,
  });
  if (cast.members.length < args.sessions) {
    log.warn(
      `only ${cast.members.length} students are free to simulate (roster ${roster.length}, real sessions ${real.length})`,
    );
  }

  const adopted = new Map<string, AdoptedSession>();
  for (const member of cast.members) {
    const row = simulated.get(member.studentId);
    if (!row) continue;
    adopted.set(member.studentId, {
      sessionId: row.id,
      state: row.state,
      status: row.status ?? {},
      seq: await lastSeq(client, row.id),
      selfPaused: row.state === "paused" && (await pausedBySelf(client, row.id)),
    });
  }
  const castIds = new Set(cast.members.map((member) => member.studentId));
  const orphans = [...simulated.values()].filter(
    (row) => !castIds.has(row.student_id) && !isFinalState(row.state),
  );
  if (orphans.length > 0) {
    log.warn(
      `${orphans.length} simulated sessions from an earlier run are not in this cast; pnpm demo:reset clears them`,
    );
  }

  log.info(
    `${style.bold(exam.title)} (${exam.code}): ${exam.status}, starts ${almatyTime(exam.startsAtMs)} Almaty, ` +
      `${exam.durationMin} min, ${questions.length} questions, roster ${roster.length}`,
  );
  log.info(
    `cast: ${cast.members.length} simulated (${adopted.size} continued from an earlier run), ` +
      `${real.length} real sessions, ${cast.notJoined.length} not joined; speed ${args.speed}x, seed ${args.seed}`,
  );
  for (const member of cast.members) {
    if (member.lobby === "normal" && member.wall === "normal" && NAMED_PARTS[member.number] === undefined)
      continue;
    const parts = [
      member.lobby !== "normal" ? `lobby ${member.lobby}` : "",
      member.wall !== "normal" ? `wall ${member.wall}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    log.info(
      `  ${member.short} (seat ${member.seat ?? "-"}, ${member.number}, ${member.os}): ${parts || "on screen"}`,
    );
  }

  // Before the lobby opens nobody can join (join_exam refuses), so wait for it.
  while (!stopRequested && clock.now() < exam.lobbyOpensAtMs) {
    log.info(
      `lobby opens at ${almatyTime(exam.lobbyOpensAtMs)} Almaty, in ${formatDuration(exam.lobbyOpensAtMs - clock.now())}`,
    );
    await sleep(Math.min(30_000, exam.lobbyOpensAtMs - clock.now()));
  }

  let watch: BroadcastWatch | null = null;
  if (args.watch && !stopRequested) {
    const staff = await staffClient(env, args["watch-as"]);
    watch = new BroadcastWatch(staff.client, staff.accessToken, exam.id);
    await watch.open();
    log.info(`watching exam:${exam.id} as ${args["watch-as"]}`);
  }

  const engine = new SimEngine({
    client,
    clock,
    exam,
    questions,
    cast: cast.members,
    adopted,
    speed: args.speed,
    heartbeatMs: args.heartbeat * 1000,
    seed: args.seed,
    concurrency: args.concurrency,
    log,
    verbose: args.verbose,
    onEventSent: watch ? (id, at) => watch?.sent(id, at) : undefined,
  });
  if (!stopRequested) engine.start();

  if (args["start-after"] !== null) {
    const delay = Math.max(0, args["start-after"] * 1000 - (Date.now() - launchedAt));
    setTimeout(() => {
      if (!stopRequested)
        void startExam(env, exam.id, args["start-as"]).catch((error: unknown) => log.warn(String(error)));
    }, delay).unref();
  }

  let lastWatchReport = Date.now();
  while (!stopRequested) {
    await sleep(500);
    if (engine.finished) requestStop("every simulated student is done");
    if (watch && Date.now() - lastWatchReport >= 10_000) {
      lastWatchReport = Date.now();
      log.info(watch.describe());
    }
  }

  log.info(`stopping (${stopReason})`);
  await engine.stop();
  log.info(engine.describe());
  let code = 0;
  if (watch) {
    await sleep(1500);
    log.info(watch.describe());
    await watch.close();
    if (watch.invalidCount > 0 || watch.missedCount > 0 || watch.latency.count === 0) {
      log.error("watch: some events never reached the exam channel, or a payload failed its contract");
      code = 1;
    }
  }
  if (args.cleanup) await cleanup(client, engine.sessionIds());
  else log.info("simulated sessions stay on the wall; pnpm demo:reset clears them");
  return code;
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

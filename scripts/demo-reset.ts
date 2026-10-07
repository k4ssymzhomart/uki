// `pnpm demo:reset`: puts the two demo exams back to the start of the demo script
// (docs/phase-0-plan.md, "Demo commands"), on the local stack or the cloud project.
//
// - Clears every session of Mathematics 2 and Physics 1, with their answers, events, frames rows,
//   still objects in the private `frames` bucket, and proctor commands. Simulated sessions go too.
// - Mathematics 2 · Midterm: starts in 15 minutes (on the server's clock, whole minutes), lobby open
//   from 20 minutes before, 90 minutes, status scheduled.
// - Physics 1 · Quiz 3: started 5 minutes ago, 40 minutes, status live. With SEED_LMS_URL set, its
//   lms_url points at that mock portal.
// Other exams (History, Linear Algebra, English B2), staff, rosters and the audit log are untouched.
// Idempotent: run it as often as you like.
//
//   pnpm demo:reset [--yes] [--dry-run] [--env-file <path>]
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY (and optionally SEED_LMS_URL) from the environment or the
// repository's .env. A cloud target asks for confirmation unless --yes is given.
import { z } from "zod";
import { almatyTime, confirm, createLogger, must, ok, parseCli, style, UsageError } from "./lib/cli.ts";
import { serverClock } from "./lib/clock.ts";
import { DEMO_EXAMS, type DemoExamKey, demoSchedule, physicsLmsUrl } from "./lib/demo.ts";
import { describeTarget, isLocalUrl, loadEnvFile, readScriptEnv } from "./lib/env.ts";
import { adminClient, listFramesUnder, removeFrames, type UkiClient } from "./lib/supabase.ts";

const log = createLogger("demo:reset");

const USAGE = `Usage: pnpm demo:reset [--yes] [--dry-run] [--env-file <path>]

  --yes            do not ask before resetting a cloud project
  --dry-run        count what would be cleared; change nothing
  --env-file <p>   read SUPABASE_URL and SUPABASE_SECRET_KEY from this file instead of .env`;

const Args = z.object({
  yes: z.boolean().default(false),
  "dry-run": z.boolean().default(false),
  "env-file": z.string().optional(),
  help: z.boolean().default(false),
});

interface ExamRow {
  id: string;
  code: string | null;
  title: string;
  status: string;
}

interface Cleared {
  stills: number;
  frames: number;
  events: number;
  commands: number;
  answers: number;
  sessions: number;
  simulated: number;
}

async function countRows(
  client: UkiClient,
  table: "frames" | "events" | "session_commands" | "sessions",
  examId: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function clearExam(client: UkiClient, exam: ExamRow, dryRun: boolean): Promise<Cleared> {
  const stills = await listFramesUnder(client, exam.id);
  const sessions = must(
    await client.from("sessions").select("id, device").eq("exam_id", exam.id),
    `sessions of ${exam.title}`,
  );
  const sessionIds = sessions.map((row) => row.id);
  const simulated = sessions.filter((row) => {
    const device = row.device;
    return (
      typeof device === "object" && device !== null && !Array.isArray(device) && device.simulated === true
    );
  }).length;
  let answers = 0;
  for (let i = 0; i < sessionIds.length; i += 100) {
    const { count, error } = await client
      .from("answers")
      .select("*", { count: "exact", head: true })
      .in("session_id", sessionIds.slice(i, i + 100));
    if (error) throw new Error(`count answers: ${error.message}`);
    answers += count ?? 0;
  }
  const cleared: Cleared = {
    stills: stills.length,
    frames: await countRows(client, "frames", exam.id),
    events: await countRows(client, "events", exam.id),
    commands: await countRows(client, "session_commands", exam.id),
    answers,
    sessions: sessionIds.length,
    simulated,
  };
  if (dryRun) return cleared;

  // Children first: frames reference events and sessions; events and commands reference sessions;
  // answers cascade with their session but are deleted explicitly so a partial run leaves no orphans.
  await removeFrames(client, stills);
  ok(await client.from("frames").delete().eq("exam_id", exam.id), "delete frames");
  ok(await client.from("events").delete().eq("exam_id", exam.id), "delete events");
  ok(await client.from("session_commands").delete().eq("exam_id", exam.id), "delete session_commands");
  for (let i = 0; i < sessionIds.length; i += 100) {
    ok(
      await client
        .from("answers")
        .delete()
        .in("session_id", sessionIds.slice(i, i + 100)),
      "delete answers",
    );
  }
  ok(await client.from("sessions").delete().eq("exam_id", exam.id), "delete sessions");
  return cleared;
}

async function main(): Promise<void> {
  const args = parseCli(
    process.argv.slice(2),
    {
      yes: { type: "boolean", short: "y" },
      "dry-run": { type: "boolean" },
      "env-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    Args,
  );
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  loadEnvFile(args["env-file"]);
  const env = readScriptEnv();
  const target = describeTarget(env.SUPABASE_URL);
  log.info(`${args["dry-run"] ? "dry run against" : "resetting"} the ${style.bold(target)}`);

  if (!args["dry-run"] && !args.yes && !isLocalUrl(env.SUPABASE_URL)) {
    if (!process.stdin.isTTY) {
      throw new UsageError(`refusing to reset the ${target} without --yes (stdin is not a terminal)`);
    }
    if (!(await confirm(`Clear the demo sessions on the ${target}?`))) {
      log.info("nothing changed");
      return;
    }
  }

  const client = adminClient(env);
  const clock = await serverClock(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  if (clock.offsetMs !== 0) log.info(`server clock is ${clock.offsetMs} ms ahead of this laptop`);

  const keys = Object.keys(DEMO_EXAMS) as DemoExamKey[];
  const codes = keys.map((key) => DEMO_EXAMS[key].code);
  const rows = must(
    await client.from("exams").select("id, code, title, status").in("code", codes),
    "demo exams",
  ) as ExamRow[];
  const byKey = new Map<DemoExamKey, ExamRow>();
  for (const key of keys) {
    const row = rows.find((exam) => exam.code === DEMO_EXAMS[key].code);
    if (!row) {
      throw new Error(
        `exam ${DEMO_EXAMS[key].code} not found: load supabase/seed.sql first (local: pnpm db:reset; cloud: docs/runbooks/cloud-setup.md)`,
      );
    }
    byKey.set(key, row);
  }

  const schedule = demoSchedule(clock.now());
  const summary: string[] = [];
  for (const key of keys) {
    const exam = byKey.get(key);
    if (!exam) continue;
    const cleared = await clearExam(client, exam, args["dry-run"]);
    const plan = schedule[key];
    const update: {
      starts_at: string;
      lobby_opens_at: string;
      duration_min: number;
      status: "scheduled" | "live";
      lms_url?: string;
    } = { ...plan };
    if (key === "physics" && env.SEED_LMS_URL !== undefined) update.lms_url = physicsLmsUrl(env.SEED_LMS_URL);
    if (!args["dry-run"]) {
      ok(await client.from("exams").update(update).eq("id", exam.id), `update ${exam.title}`);
    }
    const starts = Date.parse(plan.starts_at);
    const when =
      starts > clock.now()
        ? `starts ${almatyTime(starts)} Almaty, lobby open since ${almatyTime(Date.parse(plan.lobby_opens_at))}`
        : `started ${almatyTime(starts)} Almaty`;
    summary.push(
      `${style.bold(exam.title)} (${exam.code}): ${exam.status} -> ${plan.status}, ${when}, ${plan.duration_min} min` +
        (update.lms_url ? `, lms_url ${update.lms_url}` : ""),
      `  ${args["dry-run"] ? "would clear" : "cleared"} ${cleared.sessions} sessions (${cleared.simulated} simulated), ` +
        `${cleared.answers} answers, ${cleared.events} events, ${cleared.frames} frames rows, ` +
        `${cleared.stills} still objects, ${cleared.commands} commands`,
    );
  }
  for (const line of summary) log.info(line);
  if (!args["dry-run"]) {
    log.info(style.green("done: reload any open dashboard; a student app joins again from 1.1"));
  }
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    log.error(error.message);
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

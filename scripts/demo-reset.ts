// `pnpm demo:reset`: puts the demo back to the start of the Demo Day script (docs/phase-1-plan.md,
// "Demo commands"; Phase 0's part from docs/phase-0-plan.md), on the local stack or the cloud project.
//
// 1. One Realtime connection for a few seconds, as Dana on Mathematics 2's channel: a project creates
//    the day's realtime.messages partitions only when a client connects (scripts/lib/realtime-warmup.ts).
// 2. Phase 0: clears every session of Mathematics 2 and Physics 1, with their answers, events, frames
//    rows, still objects and proctor commands (simulated sessions too). Mathematics 2 · Midterm starts
//    in 15 minutes (server clock, whole minutes), lobby open from 20 minutes before, 90 minutes,
//    scheduled; Physics 1 · Quiz 3 started 5 minutes ago, 40 minutes, live, and with SEED_LMS_URL set
//    its lms_url points at that mock portal.
// 3. Seed v2 (scripts/lib/seed-v2/apply.ts): deletes the exams the wizard made (judge mode's DEMO-LIVE
//    stays), puts back the students with programme and year, the Autumn 2026 term with its decisions,
//    Mathematics 2's invites with Yerlan's bounced and Nurlan's unconfirmed seats, History of
//    Kazakhstan's seven flags with stills and no decision, the open help request on Physics 1, the two
//    data requests, the English B2 report shared and opened twice, the still dated 91 days ago, and
//    Dana's languages with English first. Rehearsal help requests, reports, shares and data requests go.
// Staff accounts and the audit log are kept. Idempotent: run it as often as you like.
//
//   pnpm demo:reset [--yes] [--dry-run] [--env-file <path>]
//
// Reads SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY and SEED_STAFF_PASSWORD (and
// optionally SEED_LMS_URL) from the environment or the repository's .env; --env-file .env.cloud for the
// cloud project. A cloud target asks for confirmation unless --yes is given. Exits 1 when Realtime did
// not connect, after the data is reset.
import { z } from "zod";
import {
  almatyTime,
  confirm,
  createLogger,
  formatDuration,
  must,
  ok,
  parseCli,
  style,
  UsageError,
} from "./lib/cli.ts";
import { serverClock } from "./lib/clock.ts";
import { DEMO_EXAMS, type DemoExamKey, demoSchedule, physicsLmsUrl } from "./lib/demo.ts";
import { describeTarget, isLocalUrl, loadEnvFile, readScriptEnv } from "./lib/env.ts";
import { warmRealtime } from "./lib/realtime-warmup.ts";
import { applySeedV2 } from "./lib/seed-v2/apply.ts";
import { clearExamSessions } from "./lib/seed-v2/clear.ts";
import { STAFF_EMAIL } from "./lib/seed-v2/story.ts";
import { adminClient, staffClient } from "./lib/supabase.ts";

const log = createLogger("demo:reset");

const USAGE = `Usage: pnpm demo:reset [--yes] [--dry-run] [--env-file <path>]

  --yes            do not ask before resetting a cloud project
  --dry-run        count what would be cleared and restored; change nothing
  --env-file <p>   read SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY and
                   SEED_STAFF_PASSWORD from this file instead of .env (the cloud: .env.cloud)`;

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
  if (env.SUPABASE_PUBLISHABLE_KEY === undefined || env.SEED_STAFF_PASSWORD === undefined) {
    throw new UsageError(
      "SUPABASE_PUBLISHABLE_KEY and SEED_STAFF_PASSWORD are needed: Realtime and the shared report run as Dana",
    );
  }

  if (!args["dry-run"] && !args.yes && !isLocalUrl(env.SUPABASE_URL)) {
    if (!process.stdin.isTTY) {
      throw new UsageError(`refusing to reset the ${target} without --yes (stdin is not a terminal)`);
    }
    if (!(await confirm(`Reset the demo data (Phase 0 and seed v2) on the ${target}?`))) {
      log.info("nothing changed");
      return;
    }
  }

  const client = adminClient(env);
  const clock = await serverClock(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  if (clock.offsetMs !== 0) log.info(`server clock is ${clock.offsetMs} ms ahead of this laptop`);
  const startedAt = Date.now();

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

  // Realtime first, so the day's partitions exist before the reset's writes broadcast anything.
  let realtimeOk = true;
  if (!args["dry-run"]) {
    const dana = await staffClient(env, STAFF_EMAIL.dana);
    const math2 = byKey.get("math");
    const warm = math2
      ? await warmRealtime(dana.client, dana.accessToken, math2.id)
      : { ok: false, attempts: 0, ms: null, errors: ["no Mathematics 2"] };
    dana.client.realtime.disconnect();
    await dana.client.auth.signOut();
    realtimeOk = warm.ok;
    if (warm.ok) {
      log.info(
        `realtime: connected as Dana in ${warm.ms} ms (attempt ${warm.attempts}), held a few seconds` +
          (warm.errors.length > 0 ? `; earlier attempts: ${warm.errors.join("; ")}` : ""),
      );
    } else {
      log.error(`realtime: no connection after ${warm.attempts} attempts: ${warm.errors.join("; ")}`);
    }
  }

  const schedule = demoSchedule(clock.now());
  const summary: string[] = [];
  for (const key of keys) {
    const exam = byKey.get(key);
    if (!exam) continue;
    const cleared = await clearExamSessions(client, exam.id, args["dry-run"]);
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

  const steps = await applySeedV2({ client, env, nowMs: clock.now(), dryRun: args["dry-run"], log });
  for (const step of steps) log.info(`${style.bold(step.step)}: ${step.detail}`);
  log.info(`took ${formatDuration(Date.now() - startedAt)}`);
  if (args["dry-run"]) return;
  if (!realtimeOk) {
    log.error("the data is reset, but Realtime did not connect: the walls will not update; run it again");
    process.exitCode = 1;
    return;
  }
  log.info(style.green("done: reload any open dashboard; a student app joins again from 1.1"));
}

// Exits explicitly: the staff sign-ins leave Auth's refresh timer and the Realtime socket behind.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    if (error instanceof UsageError) {
      log.error(error.message);
      process.stderr.write(`${USAGE}\n`);
      process.exit(2);
    }
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

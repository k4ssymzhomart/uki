// `pnpm judge:free-seat <number>`: frees one seat of judge mode's DEMO-LIVE (docs/runbooks/judge-mode.md),
// so the stage laptop or a judge's laptop can join it again between rehearsals without waiting for the
// rollover. On the local stack or the cloud project.
//
// 1. Finds DEMO-LIVE and the student with that number (one of 20249001 to 20249030).
// 2. Deletes the student's session of the current run with what hangs off it, child rows first, as
//    demo_live_tick's rollover does: reports, review decisions, help requests, commands, frames rows,
//    events and answers, then the session. Nothing else of the run changes.
// 3. Asks demo-live-purge (secret key) to delete the stills of sessions that no longer exist, this one's
//    included, through the Storage API, and checks that none of this session's stills are left.
// 4. Writes one audit_log row, demo_live.free_seat (actor service), with the counts.
// A seat that is already free changes nothing and writes no row. The anonymous user that held the seat
// stays signed in and may join again, with this number or another.
//
//   pnpm judge:free-seat <number> [--env-file .env.cloud] [--yes] [--dry-run]
//
// Uses the secret key, so it runs on your laptop, never on the VPS. It refuses the cloud project unless
// --yes is given.
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  DEMO_LIVE_CODE,
  DEMO_LIVE_FREE_SEAT_ACTION,
  DemoLivePurgeOutput,
  FRAMES_BUCKET,
} from "../packages/contracts/src/index.ts";
import type { UkiClient } from "../packages/db/src/index.ts";
import { createLogger, must, ok, style, UsageError } from "./lib/cli.ts";
import { describeTarget, isLocalUrl, loadEnvFile, readScriptEnv, type ScriptEnv } from "./lib/env.ts";
import {
  describeCounts,
  FREE_SEAT_TABLES,
  type FreeSeatCounts,
  type FreeSeatTable,
  parseSeatNumber,
} from "./lib/judge.ts";
import { adminClient } from "./lib/supabase.ts";

const log = createLogger("judge:free-seat");

const USAGE = `Usage: pnpm judge:free-seat <number> [--env-file <path>] [--yes] [--dry-run]

  <number>         the student number whose DEMO-LIVE seat to free, 20249001 to 20249030
                   (20249026 to 20249030 are the real-app seats; the simulator plays 20249001 to 20249024)
  --env-file <p>   SUPABASE_URL and SUPABASE_SECRET_KEY (default: the repository's .env; the cloud: .env.cloud)
  --yes            required to change the cloud project
  --dry-run        say what would go; change nothing`;

const Flags = z.object({
  "env-file": z.string().optional(),
  yes: z.boolean().default(false),
  "dry-run": z.boolean().default(false),
  help: z.boolean().default(false),
});

function parse(argv: readonly string[]): z.infer<typeof Flags> & { number: string | null } {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        "env-file": { type: "string" },
        yes: { type: "boolean", short: "y" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const flags = Flags.safeParse(parsed.values);
  if (!flags.success) {
    throw new UsageError(
      flags.error.issues.map((issue) => `--${issue.path.join(".")}: ${issue.message}`).join("\n"),
    );
  }
  if (flags.data.help) return { ...flags.data, number: null };
  const seat = parseSeatNumber(parsed.positionals);
  if ("error" in seat) throw new UsageError(seat.error);
  return { ...flags.data, number: seat.number };
}

/** POST /functions/v1/demo-live-purge with the secret key; retries while the runtime starts the function. */
async function purge(env: ScriptEnv): Promise<DemoLivePurgeOutput> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/demo-live-purge`;
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { apikey: env.SUPABASE_SECRET_KEY, "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      continue;
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) return DemoLivePurgeOutput.parse(body);
    last = `HTTP ${response.status}`;
    if (response.status < 500) break;
  }
  throw new Error(`demo-live-purge: ${last}`);
}

/** The stills still in Storage under `<exam>/<session>/`. */
async function stillsLeft(admin: UkiClient, examId: string, sessionId: string): Promise<number> {
  const listed = await admin.storage.from(FRAMES_BUCKET).list(`${examId}/${sessionId}`, { limit: 1000 });
  if (listed.error) throw new Error(`listing the session's stills: ${listed.error.message}`);
  return (listed.data ?? []).filter((object) => object.name.endsWith(".jpg")).length;
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  if (args.help || args.number === null) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const number = args.number;
  loadEnvFile(args["env-file"]);
  const env = readScriptEnv();
  const target = describeTarget(env.SUPABASE_URL);
  log.info(`${args["dry-run"] ? "dry run against" : "freeing a seat on"} the ${style.bold(target)}`);
  if (!isLocalUrl(env.SUPABASE_URL) && !args.yes && !args["dry-run"]) {
    throw new UsageError(`refusing to change the ${target} without --yes`);
  }

  const admin = adminClient(env);
  const exam = must(
    await admin
      .from("exams")
      .select("id, workspace_id, status, starts_at, duration_min")
      .eq("code", DEMO_LIVE_CODE)
      .maybeSingle(),
    `${DEMO_LIVE_CODE} (pnpm judge:setup makes it)`,
  );
  const student = must(
    await admin
      .from("students")
      .select("id, full_name")
      .eq("workspace_id", exam.workspace_id)
      .eq("student_number", number)
      .maybeSingle(),
    `student ${number} (pnpm judge:setup makes the roster)`,
  );
  const seatRow = await admin
    .from("exam_students")
    .select("seat")
    .eq("exam_id", exam.id)
    .eq("student_id", student.id)
    .maybeSingle();
  ok(seatRow, "seat");
  const seat = seatRow.data?.seat ?? null;
  const sessionRow = await admin
    .from("sessions")
    .select("id, state, joined_at")
    .eq("exam_id", exam.id)
    .eq("student_id", student.id)
    .maybeSingle();
  ok(sessionRow, "session");
  const run = `the run that started ${exam.starts_at}`;
  if (sessionRow.data === null) {
    log.info(style.green(`${number} (seat ${seat ?? "none"}) has no session in ${run}: the seat is free`));
    return;
  }
  const session = sessionRow.data;
  log.info(
    `${number} (seat ${seat ?? "none"}): session ${session.id}, ${session.state}, joined ${session.joined_at}`,
  );

  const counts: FreeSeatCounts = {
    sessions: 0,
    reports: 0,
    review_decisions: 0,
    help_requests: 0,
    session_commands: 0,
    frames: 0,
    events: 0,
    answers: 0,
  };
  if (args["dry-run"]) {
    for (const table of FREE_SEAT_TABLES) {
      const result = await admin
        .from(table)
        .select("session_id", { count: "exact", head: true })
        .eq("session_id", session.id);
      ok(result, table);
      counts[table] = result.count ?? 0;
    }
    counts.sessions = 1;
    log.info(`would delete ${describeCounts(counts)}, then purge the stills; nothing changed`);
    return;
  }

  for (const table of FREE_SEAT_TABLES) {
    const result = await admin
      .from(table as FreeSeatTable)
      .delete({ count: "exact" })
      .eq("session_id", session.id);
    ok(result, `delete ${table}`);
    counts[table] = result.count ?? 0;
  }
  const deleted = await admin.from("sessions").delete({ count: "exact" }).eq("id", session.id);
  ok(deleted, "delete the session");
  counts.sessions = deleted.count ?? 0;
  log.info(`deleted ${describeCounts(counts)}`);

  // The stills: demo-live-purge removes every DEMO-LIVE still whose session is gone, this one's included.
  let stills: DemoLivePurgeOutput | null = null;
  let left: number | null = null;
  let purgeError: string | null = null;
  try {
    stills = await purge(env);
    left = await stillsLeft(admin, exam.id, session.id);
    log.info(
      `demo-live-purge removed ${stills.removed} of ${stills.listed} orphaned stills; ` +
        `${left} of this session's left`,
    );
  } catch (error) {
    purgeError = error instanceof Error ? error.message : String(error);
  }

  ok(
    await admin.from("audit_log").insert({
      workspace_id: exam.workspace_id,
      actor_id: null,
      actor_kind: "service",
      action: DEMO_LIVE_FREE_SEAT_ACTION,
      object_type: "exam",
      object_id: exam.id,
      meta: {
        student_number: number,
        seat,
        session_id: session.id,
        run_starts_at: exam.starts_at,
        counts,
        stills: stills === null ? null : { ...stills, left },
        ...(purgeError === null ? {} : { purge_error: purgeError }),
      },
    }),
    "audit row",
  );

  if (purgeError !== null || (left ?? 0) > 0) {
    log.error(
      `the seat is free, but its stills are not all gone (${purgeError ?? `${left} left`}); ` +
        "run it again, or demo_live_tick's hourly purge removes them",
    );
    process.exitCode = 1;
    return;
  }
  log.info(style.green(`${number} is free: the laptop joins again with ${DEMO_LIVE_CODE} and this number`));
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    log.error(error.message);
    process.stderr.write(`\n${USAGE}\n`);
    process.exit(2);
  }
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

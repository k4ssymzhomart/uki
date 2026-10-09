// CI's check of `pnpm judge:free-seat` on the local stack (.github/workflows/ci.yml, the demo-scripts step),
// around a real seat taken the way a laptop takes it. Local stack only; the publishable key for the
// student, the secret key to read what is left.
//
//   node --import tsx scripts/judge-free-seat-check.ts occupy <number> --state <dir>
//     A new anonymous user joins DEMO-LIVE as <number> (apps/judge-sim's student, publishable key only),
//     checks in, raises a phone (a flag with its stills through ingest and frames), asks the proctor and
//     answers a question. A second anonymous user is then refused the same number
//     (already_joined): the seat is taken. The user's tokens stay in <dir> for `verify`.
//   pnpm judge:free-seat <number>
//   node --import tsx scripts/judge-free-seat-check.ts verify <number> --state <dir>
//     The old session is gone with its events, frames rows, answers and help request, and so are its
//     stills in Storage; one demo_live.free_seat audit row names it; and the same anonymous user joins the
//     seat again with a new session, as the stage laptop does between rehearsals.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { ApiError, SupabaseApi } from "../apps/judge-sim/src/api.ts";
import { planEpisode } from "../apps/judge-sim/src/episodes.ts";
import { loadStills, stillsDir } from "../apps/judge-sim/src/main.ts";
import { createRng } from "../apps/judge-sim/src/rng.ts";
import { StateStore } from "../apps/judge-sim/src/state.ts";
import { localeFor, SimStudent } from "../apps/judge-sim/src/student.ts";
import {
  DEMO_LIVE_CODE,
  DEMO_LIVE_FREE_SEAT_ACTION,
  FRAMES_BUCKET,
} from "../packages/contracts/src/index.ts";
import { createLogger, must, ok, UsageError } from "./lib/cli.ts";
import { isLocalUrl, loadEnvFile, readScriptEnv } from "./lib/env.ts";
import { parseSeatNumber } from "./lib/judge.ts";
import { ROOT } from "./lib/paths.ts";
import { adminClient } from "./lib/supabase.ts";

const log = createLogger("judge:free-seat check");

const Args = z.object({ state: z.string().min(1) });
/** What occupy leaves for verify next to the student's tokens. */
const Occupied = z.object({ session_id: z.uuid(), stills: z.number().int().positive() });

class CheckFailed extends Error {}

function expectThat(condition: boolean, what: string): void {
  if (!condition) throw new CheckFailed(what);
  log.info(`ok  ${what}`);
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: { state: { type: "string" } },
    strict: true,
    allowPositionals: true,
  });
  const [mode, ...rest] = parsed.positionals;
  if (mode !== "occupy" && mode !== "verify") throw new UsageError("mode: occupy or verify");
  const seat = parseSeatNumber(rest);
  if ("error" in seat) throw new UsageError(seat.error);
  const { state } = Args.parse(parsed.values);

  loadEnvFile();
  const env = readScriptEnv();
  if (!isLocalUrl(env.SUPABASE_URL)) throw new UsageError("the check runs on the local stack only");
  if (env.SUPABASE_PUBLISHABLE_KEY === undefined) throw new UsageError("SUPABASE_PUBLISHABLE_KEY is needed");

  const admin = adminClient(env);
  const exam = must(
    await admin.from("exams").select("id, starts_at").eq("code", DEMO_LIVE_CODE).maybeSingle(),
    DEMO_LIVE_CODE,
  );
  const run = { id: exam.id, startsAt: exam.starts_at };
  const api = new SupabaseApi({ url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
  const store = new StateStore(state);
  store.init();
  const stills = loadStills(stillsDir(join(ROOT, "apps", "judge-sim", "src")));
  const student = new SimStudent(seat.number, 0, {
    api,
    store,
    stills,
    serverNow: () => Date.now(),
    observeServerTime: () => {},
  });

  if (mode === "occupy") {
    student.adoptAuth(await api.signInAnonymously(Date.now()));
    expectThat((await student.join(DEMO_LIVE_CODE, run, Date.now())) === "joined", `${seat.number} joins`);
    expectThat((await student.send(student.checkInStep(0.9), Date.now(), true)).ok, "checks in");
    const ctx = {
      gazeS: 2,
      faceMissingS: 10,
      locale: student.locale,
      next: student.nextQuestion(),
      questionCount: 20,
    };
    const phone = planEpisode("phone_raised", createRng(1), ctx).steps[0];
    const flagged = phone === undefined ? 0 : (await student.send(phone, Date.now())).stills;
    expectThat(flagged > 0, `a raised phone with ${flagged} stills`);
    const ask = planEpisode("ask_proctor", createRng(3), ctx).steps[0];
    expectThat(ask !== undefined && (await student.send(ask, Date.now())).ok, "asks the proctor");
    const answer = planEpisode("answer", createRng(4), ctx).steps[0];
    expectThat(answer !== undefined && (await student.send(answer, Date.now())).ok, "answers a question");

    const other = await api.signInAnonymously(Date.now());
    let refused: string | null = null;
    try {
      await api.joinExam(
        {
          code: DEMO_LIVE_CODE,
          student_number: seat.number,
          locale: localeFor(seat.number),
          device: { os: "windows", app_version: "0.0.0-free-seat-check", simulated: true },
        },
        other.access_token,
      );
    } catch (error) {
      refused = error instanceof ApiError ? error.code : String(error);
    }
    expectThat(refused === "already_joined", "another laptop is refused the taken seat (already_joined)");
    writeFileSync(
      join(state, "occupied.json"),
      JSON.stringify({ session_id: student.file.session_id, stills: flagged }),
    );
    log.info(`session ${student.file.session_id}`);
    return;
  }

  // verify
  const occupied = Occupied.parse(JSON.parse(readFileSync(join(state, "occupied.json"), "utf8")));
  const old = occupied.session_id;
  if (student.file.session_id !== old || student.file.auth === null) {
    throw new UsageError(`run occupy ${seat.number} first`);
  }
  const count = async (table: "events" | "frames" | "answers" | "help_requests", what: string) => {
    const result = await admin
      .from(table)
      .select("session_id", { count: "exact", head: true })
      .eq("session_id", old);
    ok(result, what);
    return result.count ?? 0;
  };
  const sessions = await admin.from("sessions").select("id").eq("id", old);
  ok(sessions, "sessions");
  expectThat((sessions.data ?? []).length === 0, "the old session is gone");
  expectThat((await count("events", "events")) === 0, "its events are gone");
  expectThat((await count("frames", "frames")) === 0, "its frames rows are gone");
  expectThat((await count("answers", "answers")) === 0, "its answers are gone");
  expectThat((await count("help_requests", "help requests")) === 0, "its help request is gone");
  const listed = await admin.storage.from(FRAMES_BUCKET).list(`${exam.id}/${old}`, { limit: 100 });
  if (listed.error) throw new Error(`storage list: ${listed.error.message}`);
  expectThat(
    (listed.data ?? []).filter((o) => o.name.endsWith(".jpg")).length === 0,
    "its stills are gone from Storage",
  );
  const audit = await admin
    .from("audit_log")
    .select("actor_kind, meta")
    .eq("action", DEMO_LIVE_FREE_SEAT_ACTION)
    .eq("object_type", "exam")
    .eq("object_id", exam.id)
    .eq("meta->>session_id", old);
  ok(audit, "audit_log");
  const row = (audit.data ?? [])[0];
  const meta = z
    .object({
      student_number: z.string(),
      counts: z.object({ sessions: z.number(), events: z.number(), frames: z.number() }),
      stills: z.object({ removed: z.number(), left: z.number() }),
    })
    .safeParse(row?.meta);
  expectThat(
    (audit.data ?? []).length === 1 &&
      row?.actor_kind === "service" &&
      meta.success &&
      meta.data.student_number === seat.number &&
      meta.data.counts.sessions === 1 &&
      meta.data.counts.frames === occupied.stills &&
      meta.data.stills.removed >= occupied.stills &&
      meta.data.stills.left === 0,
    `one ${DEMO_LIVE_FREE_SEAT_ACTION} audit row with the counts`,
  );
  if (student.needsRefresh(Date.now())) await student.refresh(Date.now());
  expectThat(
    (await student.join(DEMO_LIVE_CODE, run, Date.now())) === "joined",
    "the same laptop joins the seat again",
  );
  expectThat(student.file.session_id !== null && student.file.session_id !== old, "with a new session");
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    log.error(error.message);
    process.exit(2);
  }
  log.error(
    error instanceof CheckFailed
      ? `FAILED: ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error),
  );
  process.exit(1);
});

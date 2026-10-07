// The live wall with `pnpm demo:simulate` playing 120 Mathematics 2 students (WP 0.7 exit criterion).
//
// - Aigerim, lead proctor of Mathematics 2, watches the wall in Chromium. A recorder in the page stamps
//   every tile change and every new Live events row with the page clock.
// - Three probe students, kept out of the simulator's cast, join Mathematics 2 for real (anonymous
//   sign-in, join_exam) and send gaze.off_screen through the ingest function every 2 s. Each one
//   changes the probe's tile ("looked away k×"), which gives an exact event-at-to-tile-update time
//   while the simulator loads the stack.
// - Every flag and log event the simulator sends shows as a Live events row in the same render as its
//   tile; those rows give event at to screen for the whole wall.
// - The page also stamps each Realtime frame, so every time splits on the host clock into the server
//   side (at to frame: ingest, Postgres, the trigger, Realtime) and the dashboard (frame to DOM).
// - Gulnara, proctor of Physics 1 only, signs in meanwhile: no Mathematics 2 on her overview, 404 on its
//   lobby and wall, no rows under RLS, and Realtime refuses exam:{Mathematics 2}.
//
// Sign-ins happen before the load starts. The simulator runs with --cleanup and the probes are deleted
// afterwards; Mathematics 2 keeps its status. The 1 s budgets are soft expectations, so one run lists
// every leg that misses. Figures go to the console and to wall-under-load.json under
// test-results/simulate/.
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { DEFAULT_EXAM_CHECKS, THRESHOLDS } from "../../packages/contracts/src/index.ts";
import { parseServerTiming } from "../../scripts/lib/perf/stats.ts";
import { NAMED_PARTS } from "../../scripts/lib/sim/cast.ts";
import { examRow, pageStatus, signIn, waitForWallSubscribed } from "../support/dashboard.ts";
import { ROOT } from "../support/env.ts";
import { prefix } from "../support/messages.ts";
import { EXAMS, STAFF } from "../support/seed.ts";
import { describeLatency, type LatencySummary, summarize } from "../support/stats.ts";
import { draft, ingest, type JoinedStudent, joinExam } from "../support/student.ts";
import { adminClient, cleanUp, staffClient } from "../support/supabase.ts";
import { examChannel, examRowCounts } from "../support/visibility.ts";
import {
  frameTimes,
  installSocketRecorder,
  installWallRecorder,
  readWallLog,
  tileChangeCount,
  waitForTileChange,
} from "../support/wall-recorder.ts";

/** At most 280 s: every probe event must stay inside the wall's 5-minute warning window to count up. */
const WINDOW_MS = Math.min(Number(process.env.UKI_E2E_LOAD_SECONDS ?? 240), 280) * 1000;
const MAY_START = process.env.UKI_E2E_START === "1";
const SIMULATED = 120;
const PROBES = 3;
const PROBE_EVERY_MS = 2000;
/** The plan's bar: an event shows on the proctor's wall within 1 s. */
const BUDGET_MS = 1000;
/**
 * Stored this long after its `at`, an event sat in a laptop's offline queue (the simulator's No signal
 * student holds 60 s of events): it was never live, so it is counted apart.
 */
const QUEUED_MS = 30_000;
const MADINA = "20231187";
/** RECONCILE_EVERY_MS in apps/web/src/features/wall/use-exam-channel.ts. */
const WALL_RECONCILE_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: string, check: () => Promise<T | null>, timeoutMs: number, everyMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`e2e load: timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}

/** One HTTP attempt at the ingest function from this process (the probes), with its Server-Timing. */
interface FunctionAttempt {
  status: number;
  /** Request sent to reply read, on this process's clock. */
  ms: number;
  /** The function's own time (Server-Timing total), null when the reply carried none. */
  total: number | null;
  /** Set on the first request of a fresh isolate: its start to the function being ready. */
  boot: number | null;
}

/**
 * Records every ingest attempt this process makes until stopped, by wrapping fetch: the probes' calls
 * go through e2e/support, and the split between the function's own time and the rest (gateway, edge
 * runtime queue, worker start) is what tells a slow function from a busy runtime.
 */
function recordFunctionAttempts(): { attempts: FunctionAttempt[]; stop: () => void } {
  const attempts: FunctionAttempt[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/functions/v1/ingest")) return original(input, init);
    const started = performance.now();
    try {
      const response = await original(input, init);
      const body = await response.arrayBuffer();
      const timing = parseServerTiming(response.headers.get("server-timing"));
      attempts.push({
        status: response.status,
        ms: performance.now() - started,
        total: timing.total ?? null,
        boot: timing.boot ?? null,
      });
      return new Response(body, response);
    } catch (error) {
      attempts.push({ status: 0, ms: performance.now() - started, total: null, boot: null });
      throw error;
    }
  };
  return {
    attempts,
    stop: () => {
      globalThis.fetch = original;
    },
  };
}

interface ExamState {
  status: string;
  startsAtMs: number;
  lobbyOpensAtMs: number;
  endsAtMs: number;
}

async function readMath2(): Promise<ExamState> {
  const { data, error } = await adminClient()
    .from("exams")
    .select("status, starts_at, lobby_opens_at, duration_min")
    .eq("id", EXAMS.math2.id)
    .single();
  if (error) throw new Error(`e2e load: reading Mathematics 2 failed: ${error.message}`);
  const startsAtMs = Date.parse(data.starts_at);
  return {
    status: data.status,
    startsAtMs,
    lobbyOpensAtMs: Date.parse(data.lobby_opens_at),
    endsAtMs: startsAtMs + data.duration_min * 60_000,
  };
}

/** Generic roster students (no part in the simulator's script) without a session, highest seats first. */
async function pickProbeNumbers(count: number): Promise<string[]> {
  const admin = adminClient();
  const [{ data: roster, error }, { data: sessions, error: sessionError }] = await Promise.all([
    admin.from("exam_students").select("seat, students(id, student_number)").eq("exam_id", EXAMS.math2.id),
    admin.from("sessions").select("student_id").eq("exam_id", EXAMS.math2.id),
  ]);
  if (error || sessionError) throw new Error("e2e load: reading the Mathematics 2 roster failed");
  const taken = new Set(sessions.map((row) => row.student_id));
  const free = roster
    .filter(
      (row) =>
        row.students !== null &&
        /^20235\d{3}$/.test(row.students.student_number) &&
        NAMED_PARTS[row.students.student_number] === undefined &&
        !taken.has(row.students.id),
    )
    .sort((a, b) => (b.seat ?? 0) - (a.seat ?? 0));
  if (free.length < count) throw new Error("e2e load: not enough free roster students; run pnpm demo:reset");
  return free.slice(0, count).map((row) => row.students?.student_number ?? "");
}

function startSimulator(args: string[], logPath: string): { child: ChildProcess; exited: Promise<number> } {
  const log = createWriteStream(logPath);
  // tsx forwards SIGTERM to the script, which stops cleanly (and removes its sessions with --cleanup).
  const child = spawn(`${ROOT}node_modules/.bin/tsx`, ["scripts/demo-simulate.ts", ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  const exited = new Promise<number>((resolve) => {
    child.on("exit", (code, signal) => {
      log.end();
      resolve(code ?? (signal ? 128 : 1));
    });
  });
  return { child, exited };
}

async function stopSimulator(sim: { child: ChildProcess; exited: Promise<number> }): Promise<number> {
  if (sim.child.exitCode !== null) return sim.exited;
  sim.child.kill("SIGTERM");
  const code = await Promise.race([sim.exited, sleep(180_000).then(() => null)]);
  if (code !== null) return code;
  sim.child.kill("SIGKILL");
  return sim.exited;
}

async function removeProbes(probes: readonly JoinedStudent[], uids: readonly string[]): Promise<void> {
  const admin = adminClient();
  const ids = probes.map((probe) => probe.sessionId);
  for (const probe of probes) await probe.client.removeAllChannels();
  const steps: Parameters<typeof cleanUp>[1][number][] = [];
  if (ids.length > 0) {
    steps.push(
      ["events", () => admin.from("events").delete().in("session_id", ids)],
      ["session_commands", () => admin.from("session_commands").delete().in("session_id", ids)],
      ["answers", () => admin.from("answers").delete().in("session_id", ids)],
      ["sessions", () => admin.from("sessions").delete().in("id", ids)],
      ["audit_log", () => admin.from("audit_log").delete().in("object_id", ids)],
    );
  }
  if (uids.length > 0) {
    steps.push([
      "audit_log of probes",
      () =>
        admin
          .from("audit_log")
          .delete()
          .in("actor_id", [...uids]),
    ]);
    for (const uid of uids) steps.push([`auth user ${uid}`, () => admin.auth.admin.deleteUser(uid)]);
  }
  await cleanUp("probe students", steps);
}

interface DbEvent {
  id: string;
  session_id: string;
  type: string;
  at: string;
  received_at: string;
  data: unknown;
}

/**
 * When the laptop could first send an event. A look is stamped at its 2 s crossing but sent when it
 * ends (300 ms back on screen), and two faces at their 1 s crossing but sent when the episode ends, so
 * their latency to the wall starts there, not at `at`.
 */
function sendableAtMs(event: DbEvent): number {
  const atMs = Date.parse(event.at);
  const duration = (event.data as { duration_ms?: unknown } | null)?.duration_ms;
  if (typeof duration !== "number") return atMs;
  if (event.type === "gaze.off_screen" || event.type === "gaze.down") {
    return atMs + Math.max(0, duration - DEFAULT_EXAM_CHECKS.gaze_s * 1000) + THRESHOLDS.gaze.onScreenEndMs;
  }
  // Two faces are stamped at their 1 s crossing and sent when the episode ends.
  if (event.type === "face.second") return atMs + Math.max(0, duration - THRESHOLDS.face.secondFaceMs);
  return atMs;
}

async function flagAndLogEvents(fromMs: number, toMs: number): Promise<DbEvent[]> {
  const rows: DbEvent[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = () =>
      adminClient()
        .from("events")
        .select("id, session_id, type, at, received_at, data")
        .eq("exam_id", EXAMS.math2.id)
        .in("review", ["flag", "log"])
        .gte("received_at", new Date(fromMs).toISOString())
        .lte("received_at", new Date(toMs).toISOString())
        .order("received_at")
        .range(offset, offset + 999);
    // A loaded laptop can stall Postgres past PostgREST's 8 s statement timeout; the read is safe to repeat.
    let result = await page();
    for (let attempt = 1; result.error && attempt < 4; attempt += 1) {
      await sleep(3000 * attempt);
      result = await page();
    }
    const { data, error } = result;
    if (error) throw new Error(`e2e load: reading events failed: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function storedLookAways(sessionId: string): Promise<number> {
  const { count } = await adminClient()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("type", "gaze.off_screen");
  return count ?? 0;
}

async function writingSimulated(): Promise<number> {
  const { data } = await adminClient().from("sessions").select("state, device").eq("exam_id", EXAMS.math2.id);
  return (data ?? []).filter(
    (row) =>
      typeof row.device === "object" &&
      row.device !== null &&
      !Array.isArray(row.device) &&
      row.device.simulated === true &&
      ["writing", "paused", "submitted", "ended", "time_up"].includes(row.state),
  ).length;
}

async function tileCount(page: Page): Promise<number> {
  return page.locator("[data-session-id]").count();
}

test("the wall follows 120 simulated students within 1 s, and another exam's proctor sees none of it", async ({
  page,
  browser,
}, testInfo) => {
  let exam = await readMath2();
  const now = Date.now();
  if (now < exam.lobbyOpensAtMs || now > exam.endsAtMs - WINDOW_MS - 5 * 60_000) {
    throw new Error(
      "e2e load: Mathematics 2 is not open long enough for this run; run pnpm demo:reset first",
    );
  }
  const scheduled = exam.status === "scheduled" && exam.startsAtMs > now;
  if (scheduled && !MAY_START && exam.startsAtMs - now > 10 * 60_000) {
    throw new Error(
      "e2e load: Mathematics 2 starts in more than 10 minutes; wait, or set UKI_E2E_START=1 to start it now",
    );
  }

  const probeNumbers = await pickProbeNumbers(PROBES);
  const simArgs = [
    "--sessions",
    String(SIMULATED),
    "--skip",
    [MADINA, ...probeNumbers].join(","),
    "--seconds",
    String(Math.round((WINDOW_MS + 20 * 60_000) / 1000)),
    "--cleanup",
    "--watch",
    ...(scheduled && MAY_START ? ["--start-after", "20"] : []),
  ];
  const logPath = testInfo.outputPath("demo-simulate.log");
  const probes: JoinedStudent[] = [];
  const probeUids: string[] = [];
  const otherContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: "en-GB",
    timezoneId: "Asia/Almaty",
    viewport: { width: 1440, height: 900 },
  });
  // Every sign-in happens before the load: under it, local Auth can time out reaching Postgres.
  const gulnara = await staffClient(STAFF.gulnara);
  let sim: { child: ChildProcess; exited: Promise<number> } | null = null;

  try {
    await installSocketRecorder(page);
    await signIn(page, STAFF.aigerim);
    const other = await otherContext.newPage();
    await signIn(other, STAFF.gulnara);
    for (const number of probeNumbers) {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const probe = await joinExam(EXAMS.math2.code, number);
          probes.push(probe);
          probeUids.push(probe.uid);
          break;
        } catch (error) {
          const uid = (error as { uid?: unknown }).uid;
          if (typeof uid === "string") probeUids.push(uid);
          // A sign-in that timed out on a loaded laptop made no user and no session: try it again.
          // A failed join_exam (it carries the uid) may have bound the seat, so it is not repeated.
          if (typeof uid === "string" || attempt >= 3) throw error;
          await sleep(5000 * attempt);
        }
      }
    }

    sim = startSimulator(simArgs, logPath);
    exam = await until(
      "Mathematics 2 to start",
      async () => {
        const state = await readMath2();
        return state.status === "live" || state.startsAtMs <= Date.now() ? state : null;
      },
      Math.max(60_000, exam.startsAtMs - Date.now() + 120_000),
    );
    for (const probe of probes) await ingest(probe, [draft("exam.started", {})], { question: 1 });
    const writing = await until(
      `${SIMULATED - 10} simulated students writing`,
      async () => {
        const n = await writingSimulated();
        return n >= SIMULATED - 10 ? n : null;
      },
      5 * 60_000,
    );

    // Aigerim's wall.
    const subscribed = waitForWallSubscribed(page, EXAMS.math2.id);
    await page.goto(`/exams/${EXAMS.math2.id}/live`);
    await subscribed;
    await expect.poll(() => tileCount(page)).toBeGreaterThanOrEqual(SIMULATED - 10 + PROBES);
    await installWallRecorder(page);

    // Gulnara, during the load: nothing of Mathematics 2 on her screens, in the API or on Realtime.
    await other.goto("/overview");
    await expect(examRow(other, EXAMS.physics1.title)).toHaveCount(1);
    await expect(examRow(other, EXAMS.math2.title)).toHaveCount(0);
    const pageStatuses: Record<string, number | undefined> = {};
    for (const path of [`/exams/${EXAMS.math2.id}/live`, `/exams/${EXAMS.math2.id}/lobby`]) {
      pageStatuses[path] = await pageStatus(other, path);
    }
    const refused = await examChannel(gulnara.client, EXAMS.math2.id);

    // The window: probes look away in turn, each event timed from its `at` to the tile change.
    const probeSamples: {
      probe: number;
      k: number;
      eventId: string;
      /** Page clock when the tile changed; `at` and the ingest call are on the same clock. */
      tileAt: number;
      atMs: number;
      ms: number;
      ingestMs: number;
    }[] = [];
    /** Stored, but the tile did not show it within 30 s (the wall reconciles every 20 s). */
    const probeMisses: { probe: number; k: number; reason: string }[] = [];
    /** The ingest call itself failed (gateway or function error after retries). */
    const ingestFailures: { probe: number; k: number; reason: string }[] = [];
    const counts = probes.map(() => 0);
    const recorder = recordFunctionAttempts();
    const windowStart = Date.now();
    let turn = 0;
    while (Date.now() - windowStart < WINDOW_MS) {
      const slot = Date.now();
      const index = turn % probes.length;
      turn += 1;
      const probe = probes[index];
      if (probe === undefined) break;
      const k = (counts[index] ?? 0) + 1;
      counts[index] = k;
      const after = await tileChangeCount(page);
      const sentAt = Date.now();
      let sent: Awaited<ReturnType<typeof ingest>>["sent"];
      try {
        ({ sent } = await ingest(probe, [
          draft("gaze.off_screen", { duration_ms: 2100, direction: k % 2 === 0 ? "right" : "left" }),
        ]));
      } catch (error) {
        // Nothing reached the wall to time. Count what the database holds, so the next expected
        // "looked away k×" stays right whether or not this event was stored before the failure.
        ingestFailures.push({
          probe: index,
          k,
          reason: error instanceof Error ? error.message : String(error),
        });
        counts[index] = await storedLookAways(probe.sessionId);
        await sleep(Math.max(0, PROBE_EVERY_MS - (Date.now() - slot)));
        continue;
      }
      try {
        const ingestMs = Date.now() - sentAt;
        const event = sent[0];
        if (event === undefined) throw new Error("ingest sent nothing");
        const atMs = event.atMs;
        const change = await waitForTileChange(
          page,
          {
            sessionId: probe.sessionId,
            after,
            state: "warning",
            textIncludes:
              k === 1
                ? prefix("dashboard.wall.tile.lookedAwayOnce")
                : prefix("dashboard.wall.tile.lookedAway", { count: k }),
          },
          30_000,
        );
        probeSamples.push({
          probe: index,
          k,
          eventId: event.id,
          tileAt: change.t,
          atMs,
          ms: change.t - atMs,
          ingestMs,
        });
      } catch (error) {
        probeMisses.push({ probe: index, k, reason: error instanceof Error ? error.message : String(error) });
      }
      await sleep(Math.max(0, PROBE_EVERY_MS - (Date.now() - slot)));
    }
    const windowEnd = Date.now();
    recorder.stop();
    const attempts = recorder.attempts;
    // Let the wall's periodic reconcile pick up anything Realtime did not deliver before reading.
    await sleep(WALL_RECONCILE_MS + 5000);

    // Every flag and log event of the window against the Live events rows that showed it.
    const wallLog = await readWallLog(page);
    const events = await flagAndLogEvents(windowStart, windowEnd);
    const probeSessions = new Set(probes.map((probe) => probe.sessionId));
    const rowsByAt = new Map<number, number>();
    for (const row of wallLog.feed) {
      const atMs = Date.parse(row.at);
      const seen = rowsByAt.get(atMs);
      if (seen === undefined || row.t < seen) rowsByAt.set(atMs, row.t);
    }
    // Realtime frames, stamped in the page, split each time on the host clock alone.
    const frames = await frameTimes(page, [
      ...probeSamples.map((sample) => sample.eventId),
      ...events.map((event) => event.id),
    ]);
    const probeLegs = probeSamples.flatMap((sample) => {
      const frame = frames[sample.eventId];
      return frame === undefined ? [] : [{ server: frame - sample.atMs, dashboard: sample.tileAt - frame }];
    });
    const feed = {
      sim: [] as number[],
      probe: [] as number[],
      server: [] as number[],
      dashboard: [] as number[],
    };
    let queued = 0;
    /** Shown without a Realtime frame: Realtime lost it and the wall's reconcile read it back. */
    let recovered = 0;
    const notShown: DbEvent[] = [];
    for (const event of events) {
      const atMs = Date.parse(event.at);
      // received_at is the Docker VM's clock (seconds of drift at most), far inside this 30 s margin.
      if (Date.parse(event.received_at) - atMs > QUEUED_MS) {
        queued += 1;
        continue;
      }
      const shownAt = rowsByAt.get(atMs);
      if (shownAt === undefined) {
        notShown.push(event);
        continue;
      }
      const sentMs = sendableAtMs(event);
      (probeSessions.has(event.session_id) ? feed.probe : feed.sim).push(shownAt - sentMs);
      const frame = frames[event.id];
      if (frame !== undefined) {
        feed.server.push(frame - sentMs);
        feed.dashboard.push(shownAt - frame);
      } else {
        recovered += 1;
      }
    }

    const otherCounts = await examRowCounts(gulnara.client, EXAMS.math2.id);
    const simulatedNow = await writingSimulated();
    const tilesOnWall = await tileCount(page);
    // Stop the simulator now: it prints its own --watch figures and exits 1 if a broadcast went missing.
    const simExit = await stopSimulator(sim);
    sim = null;
    // End to end: the event's `at` on the laptop to the proctor's screen. Server side: `at` to the
    // Realtime frame reaching the page (ingest, Postgres, the broadcast trigger, Realtime). Dashboard:
    // that frame to the DOM change.
    const summaries = {
      endToEndProbeTile: summarize(probeSamples.map((sample) => sample.ms)),
      endToEndSimulatedFeed: summarize(feed.sim),
      probeIngestCall: summarize(probeSamples.map((sample) => sample.ingestMs)),
      probeAttemptInFunction: summarize(attempts.flatMap((a) => (a.total === null ? [] : [a.total]))),
      probeAttemptOutsideFunction: summarize(
        attempts.flatMap((a) => (a.total === null ? [] : [Math.max(0, a.ms - a.total)])),
      ),
      serverProbe: summarize(probeLegs.map((leg) => leg.server)),
      serverAllEvents: summarize(feed.server),
      dashboardProbeTile: summarize(probeLegs.map((leg) => leg.dashboard)),
      dashboardFeedRow: summarize(feed.dashboard),
    } satisfies Record<string, LatencySummary>;
    const labels: Record<keyof typeof summaries, string> = {
      endToEndProbeTile: "end to end: probe event at -> tile update (app path through ingest)",
      endToEndSimulatedFeed: "end to end: simulated event at -> Live events row",
      probeIngestCall: "probe ingest function call",
      probeAttemptInFunction: "probe ingest attempt: inside the function (Server-Timing total)",
      probeAttemptOutsideFunction: "probe ingest attempt: gateway and edge runtime (call minus function)",
      serverProbe: "server side: probe event at -> Realtime frame in the page",
      serverAllEvents: "server side: event at -> Realtime frame (all flag and log events)",
      dashboardProbeTile: "dashboard: Realtime frame -> probe tile update",
      dashboardFeedRow: "dashboard: Realtime frame -> Live events row (all events)",
    };
    const report = {
      window: {
        start: new Date(windowStart).toISOString(),
        seconds: Math.round((windowEnd - windowStart) / 1000),
      },
      simulated: { writingAtStart: writing, atEnd: simulatedNow, tilesOnWall, exitCode: simExit },
      summaries,
      probeMisses,
      ingestFailures,
      functionAttempts: {
        n: attempts.length,
        byStatus: Object.fromEntries(
          [...new Set(attempts.map((a) => a.status))].map((status) => [
            status,
            attempts.filter((a) => a.status === status).length,
          ]),
        ),
        withoutTiming: attempts.filter((a) => a.total === null).length,
        freshIsolates: attempts.filter((a) => a.boot !== null).length,
        boot: summarize(attempts.flatMap((a) => (a.boot === null ? [] : [a.boot]))),
      },
      feed: {
        eventsInWindow: events.length,
        queuedOffline: queued,
        recoveredByReconcile: recovered,
        notShown: notShown.length,
      },
      otherProctor: {
        pages: pageStatuses,
        channel: { status: refused.status, error: refused.error, received: refused.received.length },
        rows: otherCounts,
      },
    };
    for (const key of Object.keys(summaries) as (keyof typeof summaries)[]) {
      console.log(describeLatency(labels[key], summaries[key]));
    }
    console.log(JSON.stringify({ ...report, summaries: undefined }, null, 2));
    const reportPath = testInfo.outputPath("wall-under-load.json");
    const notShownDetail = await Promise.all(
      notShown.map(async (event) => ({
        ...event,
        frameAt: frames[event.id] ?? null,
        rowsWithItsTime: await page
          .locator("section li time")
          .evaluateAll(
            (nodes, atMs) =>
              nodes.filter((node) => Date.parse(node.getAttribute("datetime") ?? "") === atMs).length,
            Date.parse(event.at),
          ),
      })),
    );
    writeFileSync(
      reportPath,
      JSON.stringify({ ...report, labels, probeSamples, notShown: notShownDetail }, null, 2),
    );
    await testInfo.attach("wall-under-load.json", { path: reportPath, contentType: "application/json" });

    // Gulnara saw nothing of Mathematics 2.
    expect(pageStatuses).toEqual({
      [`/exams/${EXAMS.math2.id}/live`]: 404,
      [`/exams/${EXAMS.math2.id}/lobby`]: 404,
    });
    expect(refused.status, refused.error ?? "").toBe("CHANNEL_ERROR");
    expect(refused.error).toMatch(/unauthorized/i);
    expect(refused.received).toEqual([]);
    expect(
      Object.values(otherCounts).every((n) => n === 0),
      JSON.stringify(otherCounts),
    ).toBe(true);
    // The load was there, and the wall kept up.
    expect(simulatedNow).toBeGreaterThanOrEqual(SIMULATED - 10);
    // The simulator's own --watch client has no reconcile: a broadcast Realtime dropped shows there.
    expect.soft(simExit, "demo:simulate --watch exit code (1: a broadcast never arrived)").toBe(0);
    expect(probeMisses).toEqual([]);
    expect.soft(ingestFailures, "ingest calls that failed after retries").toEqual([]);
    expect(notShown.map((event) => `${event.type} ${event.at}`)).toEqual([]);
    // Each leg against the 1 s bar; soft, so one run reports every leg that misses it. The simulated
    // events' end to end is reported, not asserted: the simulator stamps `at` on the server-corrected
    // clock (the Docker VM's, which drifts from the host's by hundreds of ms), while the page measures on
    // the host clock. The probes time the same path on one clock, and the simulator's own --watch client
    // times send to broadcast on one clock.
    for (const key of ["dashboardProbeTile", "dashboardFeedRow", "endToEndProbeTile"] as const) {
      expect.soft(summaries[key].p95, `p95 of ${labels[key]}`).toBeLessThan(BUDGET_MS);
    }
  } finally {
    await gulnara.client.removeAllChannels();
    await gulnara.client.auth.signOut().catch(() => undefined);
    await otherContext.close();
    if (sim !== null) console.log(`demo:simulate stopped, exit ${await stopSimulator(sim)}`);
    await removeProbes(probes, probeUids);
    if (existsSync(logPath)) {
      const tail = readFileSync(logPath, "utf8").trim().split("\n").slice(-4).join("\n");
      console.log(`demo:simulate, last lines:\n${tail}`);
      await testInfo.attach("demo-simulate.log", { path: logPath, contentType: "text/plain" });
    }
  }
});

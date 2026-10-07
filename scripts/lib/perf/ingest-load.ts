// Load measurement for the ingest path on the local stack: N students who joined a throwaway exam
// through join_exam call the `ingest` Edge Function with their own tokens, as the desktop app does
// (a heartbeat every --heartbeat seconds, events now and then, flags with three stills), while a
// proctor listens on exam:{id} as the wall does. With --via rpc the sessions are made with the secret
// key and call `ingest_batch` through PostgREST directly, as demo:simulate does: the database, its
// triggers and Realtime without the Edge Function. Reports, as p50/p95/p99/max:
// - sequential: one student's calls back to back (heartbeats, then 10-event batches), the cost of
//   one request on a quiet stack, with the function's own Server-Timing phases;
// - load: every student at once for --seconds: ingest call time, event `at` to its Realtime
//   broadcast, tile messages a second, failures, and how often the edge runtime replaced a worker
//   (the local runtime's /_internal/metric).
// Local stack only: --via function signs in N anonymous users (the local limit is 1000 an hour).
// Everything it made is removed at the end, also after Ctrl+C.
//
//   pnpm exec tsx scripts/lib/perf/ingest-load.ts [--sessions 120] [--seconds 120] [--heartbeat 10]
//     [--sequential 40] [--events-every 20] [--flag-share 0.1] [--via function|rpc] [--out file.json]
//     [--label text]
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  ClientEventEnvelope,
  type EventData,
  type EventType,
  examTopic,
  IngestRequest,
  IngestResponse,
  type IngestStatus,
  parseExamMessage,
  serverReview,
  uuidv7,
} from "../../../packages/contracts/src/index.ts";
import type { Json } from "../../../packages/db/src/index.ts";
import { createLogger, numberFlag, parseCli, UsageError } from "../cli.ts";
import { isLocalUrl, loadEnvFile, readScriptEnv } from "../env.ts";
import { adminClient, type UkiClient } from "../supabase.ts";
import { createPerfWorld, type PerfStudent, type PerfWorld } from "./fixture.ts";
import { Buckets, describe, parseServerTiming, type Summary, summarize } from "./stats.ts";

const log = createLogger("perf:ingest");

const USAGE = `Usage: pnpm exec tsx scripts/lib/perf/ingest-load.ts [options]

  --sessions <n>       students, 1 to 300 (default 120)
  --seconds <n>        length of the load phase, 0 to 1800 (default 120)
  --heartbeat <s>      seconds between a student's calls without events, 2 to 30 (default 10, the app's)
  --sequential <n>     calls of the one-student phase, per kind, 0 to 500 (default 40)
  --events-every <s>   mean seconds between a student's event calls, 2 to 600 (default 20)
  --flag-share <x>     share of event calls that carry a flag with 3 stills, 0 to 1 (default 0.1)
  --via <path>         function (default): the ingest Edge Function with each student's token;
                       rpc: ingest_batch through PostgREST with the secret key, as demo:simulate
  --out <path>         also write the report as JSON to this file
  --label <text>       a name for this run in the report
  --env-file <path>    read the environment from this file instead of .env`;

const Args = z.object({
  sessions: numberFlag(1, 300, 120),
  seconds: numberFlag(0, 1800, 120),
  heartbeat: numberFlag(2, 30, 10),
  sequential: numberFlag(0, 500, 40),
  "events-every": numberFlag(2, 600, 20),
  "flag-share": numberFlag(0, 1, 0.1),
  via: z.enum(["function", "rpc"]).default("function"),
  out: z.string().optional(),
  label: z.string().default(""),
  "env-file": z.string().optional(),
  help: z.boolean().default(false),
});
type Args = z.infer<typeof Args>;

const RuntimeMetric = z.object({
  activeUserWorkersCount: z.number(),
  retiredUserWorkersCount: z.number(),
  receivedRequestsCount: z.number(),
  handledRequestsCount: z.number(),
});
type RuntimeMetric = z.infer<typeof RuntimeMetric>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CallResult {
  status: number;
  ms: number;
  timing: Record<string, number>;
  /** The reply's Server-Timing marked a fresh isolate (a `boot` metric). */
  cold: boolean;
  error?: string;
}

interface Draft {
  type: EventType;
  data: EventData<EventType>;
  frameCount: number;
}

class Ingest {
  private readonly url: string;

  constructor(
    supabaseUrl: string,
    private readonly publishableKey: string,
    private readonly onSent: (eventId: string, atMs: number) => void,
    /** Set for --via rpc: ingest_batch with the secret key, the review from the contracts' map. */
    private readonly admin: UkiClient | null = null,
  ) {
    this.url = `${supabaseUrl}/functions/v1/ingest`;
  }

  async call(student: PerfStudent, drafts: readonly Draft[], status?: IngestStatus): Promise<CallResult> {
    const atMs = Date.now();
    const events = drafts.map((draft) => {
      student.seq += 1;
      return ClientEventEnvelope.parse({
        id: uuidv7(atMs),
        session_id: student.sessionId,
        type: draft.type,
        source: "app",
        at: new Date(atMs).toISOString(),
        seq: student.seq,
        data: draft.data,
        frame_count: draft.frameCount,
        app_version: "0.0.0-perf",
      });
    });
    const body = JSON.stringify(
      IngestRequest.parse({
        session_id: student.sessionId,
        events,
        ...(status === undefined ? {} : { status }),
      }),
    );
    for (const event of events) this.onSent(event.id, atMs);
    if (this.admin !== null) return this.rpc(this.admin, student.sessionId, events, status);
    const started = performance.now();
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          apikey: this.publishableKey,
          authorization: `Bearer ${student.token}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      const ms = performance.now() - started;
      const timing = parseServerTiming(response.headers.get("server-timing"));
      const cold = timing.boot !== undefined;
      if (response.status !== 200)
        return { status: response.status, ms, timing, cold, error: text.slice(0, 200) };
      const reply = IngestResponse.safeParse(JSON.parse(text));
      if (!reply.success) return { status: 0, ms, timing, cold, error: "reply failed IngestResponse" };
      return { status: 200, ms, timing, cold };
    } catch (error) {
      return {
        status: 0,
        ms: performance.now() - started,
        timing: {},
        cold: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async rpc(
    admin: UkiClient,
    sessionId: string,
    events: readonly ClientEventEnvelope[],
    status: IngestStatus | undefined,
  ): Promise<CallResult> {
    const batch = events.map((event) => ({
      ...event,
      review: serverReview(event.type, { fullscreenExitCount: 0 }),
    }));
    const started = performance.now();
    const { error } = await admin.rpc("ingest_batch", {
      p_session_id: sessionId,
      p_events: batch as unknown as Json,
      p_status: (status ?? null) as Json,
    });
    const ms = performance.now() - started;
    if (error) return { status: 0, ms, timing: {}, cold: false, error: error.message };
    return { status: 200, ms, timing: {}, cold: false };
  }
}

/** The proctor's view: every event broadcast matched to the moment its `at` was stamped. */
class Watch {
  private readonly pending = new Map<string, number>();
  readonly eventLatency: number[] = [];
  tiles = 0;
  events = 0;
  invalid = 0;
  private channel: ReturnType<PerfWorld["proctor"]["client"]["channel"]> | null = null;

  constructor(private readonly world: PerfWorld) {}

  async open(): Promise<void> {
    const channel = this.world.proctor.client.channel(examTopic(this.world.examId), {
      config: { private: true },
    });
    this.channel = channel;
    for (const name of ["event", "session"] as const) {
      channel.on("broadcast", { event: name }, (message: { payload?: unknown }) => {
        const parsed = parseExamMessage(name, message.payload);
        if (parsed === null) {
          this.invalid += 1;
          return;
        }
        if (parsed.event === "session") {
          this.tiles += 1;
          return;
        }
        if (parsed.event !== "event") return;
        this.events += 1;
        const at = this.pending.get(parsed.payload.id);
        if (at === undefined) return;
        this.pending.delete(parsed.payload.id);
        this.eventLatency.push(Date.now() - at);
      });
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("watch: no SUBSCRIBED in 30 s")), 30_000);
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`watch: ${status} ${error?.message ?? ""}`));
        }
      });
    });
  }

  sent(eventId: string, atMs: number): void {
    this.pending.set(eventId, atMs);
  }

  /** Events sent but never broadcast (checked after the run has settled). */
  get missing(): number {
    return this.pending.size;
  }

  reset(): void {
    this.pending.clear();
    this.eventLatency.length = 0;
    this.tiles = 0;
    this.events = 0;
  }

  async close(): Promise<void> {
    if (this.channel) await this.world.proctor.client.removeChannel(this.channel);
  }
}

async function runtimeMetric(supabaseUrl: string): Promise<RuntimeMetric | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/_internal/metric`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const parsed = RuntimeMetric.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function runtimeDelta(before: RuntimeMetric | null, after: RuntimeMetric | null) {
  if (before === null || after === null) return null;
  const requests = after.receivedRequestsCount - before.receivedRequestsCount;
  const retired = after.retiredUserWorkersCount - before.retiredUserWorkersCount;
  return {
    requests,
    retiredWorkers: retired,
    requestsPerRetiredWorker: retired > 0 ? Math.round(requests / retired) : null,
    activeWorkersAtEnd: after.activeUserWorkersCount,
  };
}

interface PhaseReport {
  calls: Summary;
  coldCalls: Summary;
  failures: number;
  failureSamples: string[];
  serverTiming: Record<string, Summary>;
  runtime: ReturnType<typeof runtimeDelta>;
}

class Phase {
  private readonly ms: number[] = [];
  private readonly coldMs: number[] = [];
  private readonly timing = new Buckets();
  private failures = 0;
  private readonly failureSamples: string[] = [];

  record(result: CallResult): void {
    if (result.status !== 200) {
      this.failures += 1;
      if (this.failureSamples.length < 10) this.failureSamples.push(`${result.status} ${result.error ?? ""}`);
      return;
    }
    this.ms.push(result.ms);
    if (result.cold) this.coldMs.push(result.ms);
    this.timing.addAll(result.timing);
  }

  report(runtime: ReturnType<typeof runtimeDelta>): PhaseReport {
    return {
      calls: summarize(this.ms),
      coldCalls: summarize(this.coldMs),
      failures: this.failures,
      failureSamples: this.failureSamples,
      serverTiming: this.timing.summaries(),
      runtime,
    };
  }
}

function heartbeatStatus(question: number): IngestStatus {
  return { question };
}

async function main(): Promise<number> {
  const args: Args = parseCli(
    process.argv.slice(2),
    {
      sessions: { type: "string" },
      seconds: { type: "string" },
      heartbeat: { type: "string" },
      sequential: { type: "string" },
      "events-every": { type: "string" },
      "flag-share": { type: "string" },
      via: { type: "string" },
      out: { type: "string" },
      label: { type: "string" },
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
  if (!isLocalUrl(env.SUPABASE_URL)) throw new UsageError("ingest-load runs against the local stack only");
  const publishable = env.SUPABASE_PUBLISHABLE_KEY;
  if (publishable === undefined) throw new UsageError("SUPABASE_PUBLISHABLE_KEY is required");

  // Ctrl+C or SIGTERM ends the phases early; the throwaway exam is still removed.
  let stopRequested = false;
  const requestStop = () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    log.warn("stopping: the throwaway exam is removed next (Ctrl+C again quits at once)");
  };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);

  const setupStarted = Date.now();
  log.info(
    `making a throwaway exam with ${args.sessions} students` +
      (args.via === "function" ? " (anonymous sign-in, join_exam)" : " (sessions made with the secret key)"),
  );
  const world = await createPerfWorld(env, {
    students: args.sessions,
    questions: 20,
    log,
    signIn: args.via === "function",
  });
  log.info(`exam ${world.examCode} ready in ${Math.round((Date.now() - setupStarted) / 1000)} s`);
  const watch = new Watch(world);
  const ingest = new Ingest(
    env.SUPABASE_URL,
    publishable,
    (id, at) => watch.sent(id, at),
    args.via === "rpc" ? adminClient(env) : null,
  );
  const question = new Map<string, number>();
  const report: Record<string, unknown> = {
    label: args.label,
    startedAt: new Date().toISOString(),
    args: { ...args, "env-file": undefined },
  };

  const pickQuestion = (student: PerfStudent) => {
    const next = Math.min(world.questionIds.length, (question.get(student.sessionId) ?? 1) + 1);
    question.set(student.sessionId, next);
    return next;
  };
  const eventDrafts = (student: PerfStudent): { drafts: Draft[]; status: IngestStatus } => {
    if (Math.random() < args["flag-share"]) {
      return {
        drafts: [
          {
            type: "gaze.off_screen",
            data: { duration_ms: 2100, direction: Math.random() < 0.5 ? "left" : "right" },
            frameCount: 3,
          },
        ],
        status: heartbeatStatus(question.get(student.sessionId) ?? 1),
      };
    }
    const previous = question.get(student.sessionId) ?? 1;
    const questionId = world.questionIds[previous - 1] ?? world.questionIds[0] ?? uuidv7();
    return {
      drafts: [{ type: "answer.saved", data: { question_id: questionId }, frameCount: 0 }],
      status: heartbeatStatus(pickQuestion(student)),
    };
  };

  let code = 0;
  try {
    await watch.open();
    log.info(`watching ${examTopic(world.examId)} as the exam's proctor`);

    // Everyone starts writing: exam.started with question 1, eight at a time.
    const start = new Phase();
    const startBefore = await runtimeMetric(env.SUPABASE_URL);
    for (let i = 0; i < world.students.length && !stopRequested; i += 8) {
      await Promise.all(
        world.students.slice(i, i + 8).map(async (student) => {
          question.set(student.sessionId, 1);
          start.record(
            await ingest.call(student, [{ type: "exam.started", data: {}, frameCount: 0 }], { question: 1 }),
          );
        }),
      );
    }
    report.start = start.report(runtimeDelta(startBefore, await runtimeMetric(env.SUPABASE_URL)));
    log.info(`start: ${describe((report.start as PhaseReport).calls)}`);

    // One student, back to back.
    const first = world.students[0];
    if (first !== undefined && args.sequential > 0) {
      for (const [name, drafts] of [
        ["sequentialHeartbeat", () => []],
        [
          "sequentialTenEvents",
          () =>
            Array.from({ length: 10 }, () => ({
              type: "answer.saved" as const,
              data: { question_id: world.questionIds[0] ?? uuidv7() },
              frameCount: 0,
            })),
        ],
      ] as const) {
        const phase = new Phase();
        const before = await runtimeMetric(env.SUPABASE_URL);
        for (let i = 0; i < args.sequential && !stopRequested; i += 1) {
          phase.record(await ingest.call(first, drafts(), heartbeatStatus(1)));
          // Under the function's limit of 10 calls a second per session.
          await sleep(150);
        }
        report[name] = phase.report(runtimeDelta(before, await runtimeMetric(env.SUPABASE_URL)));
        log.info(`${name}: ${describe((report[name] as PhaseReport).calls)}`);
      }
    }

    // Everyone at once.
    if (args.seconds > 0 && !stopRequested) {
      await sleep(2000);
      watch.reset();
      const load = new Phase();
      const before = await runtimeMetric(env.SUPABASE_URL);
      const started = Date.now();
      const endAt = started + args.seconds * 1000;
      const heartbeatMs = args.heartbeat * 1000;
      const eventsMs = args["events-every"] * 1000;
      let inFlight = 0;
      let maxInFlight = 0;
      const loops = world.students.map(async (student) => {
        // Spread the first calls over one heartbeat, as laptops that joined at different times.
        await sleep(Math.random() * heartbeatMs);
        let nextEventAt = Date.now() + Math.random() * 2 * eventsMs;
        while (Date.now() < endAt && !stopRequested) {
          const withEvents = Date.now() >= nextEventAt;
          const { drafts, status } = withEvents
            ? eventDrafts(student)
            : { drafts: [], status: heartbeatStatus(question.get(student.sessionId) ?? 1) };
          if (withEvents) nextEventAt = Date.now() + Math.random() * 2 * eventsMs;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          const result = await ingest.call(student, drafts, status);
          inFlight -= 1;
          load.record(result);
          // The app's sync loop: the next call when the heartbeat is due or an event is waiting.
          const wait = Math.min(
            heartbeatMs * (0.9 + 0.2 * Math.random()),
            Math.max(0, nextEventAt - Date.now()),
          );
          await sleep(result.status === 200 ? wait : 2000);
        }
      });
      const progress = setInterval(() => {
        const elapsed = Math.round((Date.now() - started) / 1000);
        log.info(
          `  ${elapsed} s: ${inFlight} calls in flight, ${watch.events} events and ${watch.tiles} tiles seen`,
        );
      }, 15_000);
      await Promise.all(loops);
      clearInterval(progress);
      const elapsedS = (Date.now() - started) / 1000;
      // Let the last broadcasts arrive.
      await sleep(5000);
      report.load = {
        ...load.report(runtimeDelta(before, await runtimeMetric(env.SUPABASE_URL))),
        seconds: Math.round(elapsedS),
        maxInFlight,
        eventToBroadcast: summarize(watch.eventLatency),
        eventsMissing: watch.missing,
        eventsSeen: watch.events,
        tilesPerSecond: Math.round((watch.tiles / elapsedS) * 10) / 10,
        invalidMessages: watch.invalid,
      };
      const loadReport = report.load as PhaseReport & { eventToBroadcast: Summary; tilesPerSecond: number };
      log.info(`load ingest: ${describe(loadReport.calls)} · ${loadReport.failures} failed`);
      log.info(`load event at -> broadcast: ${describe(loadReport.eventToBroadcast)}`);
      log.info(
        `load tiles a second: ${loadReport.tilesPerSecond} · runtime ${JSON.stringify(loadReport.runtime)}`,
      );
      if (loadReport.failures > 0 || watch.missing > 0) code = 1;
    }
  } finally {
    await watch.close().catch(() => undefined);
    log.info("removing the throwaway exam");
    await world.destroy();
  }

  report.finishedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 2);
  if (args.out) writeFileSync(args.out, `${json}\n`);
  process.stdout.write(`${json}\n`);
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
    log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  });

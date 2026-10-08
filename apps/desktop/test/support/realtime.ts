// Realtime on the local stack, for the P.10 restart test (realtime-restart.spec.ts): the container,
// stopped and started through the Docker CLI; the server's ping through the API gateway; and what
// reached the student window, read from its network as Playwright sees it: Realtime frames, ingest
// replies and the command catch-up reads. Each of the three can carry a proctor command to the app.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Page, Request, WebSocket } from "@playwright/test";
import { sessionTopic } from "@uki/contracts";
import { ROOT, type StackEnv } from "../../../../test/integration/stack.ts";

const execFileAsync = promisify(execFile);

/** `supabase_realtime_<project_id>`, the container the Supabase CLI runs Realtime in for this repo. */
export function realtimeContainer(): string {
  const config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("realtime: no project_id in supabase/config.toml");
  return `supabase_realtime_${projectId}`;
}

async function docker(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileAsync("docker", args, { timeout: timeoutMs, encoding: "utf8" });
  return stdout.trim();
}

/** True when the container runs; throws when Docker or the container is missing. */
export async function containerRunning(name: string): Promise<boolean> {
  return (await docker(["inspect", "--format", "{{.State.Running}}", name])) === "true";
}

/** `docker stop`: Realtime gets SIGTERM, and SIGKILL after 10 s. */
export async function stopContainer(name: string): Promise<void> {
  await docker(["stop", "--time", "10", name]);
}

export async function startContainer(name: string): Promise<void> {
  await docker(["start", name]);
}

/** `docker restart`: stop as above, then start; resolves once Docker has started it again. */
export async function restartContainer(name: string): Promise<void> {
  await docker(["restart", "--time", "10", name]);
}

/** Realtime's own ping through the gateway: true on a 200 within 1 s. */
export async function realtimePing(stack: StackEnv): Promise<boolean> {
  try {
    const response = await fetch(`${stack.apiUrl}/realtime/v1/api/ping`, {
      headers: { apikey: stack.publishableKey },
      signal: AbortSignal.timeout(1000),
    });
    await response.body?.cancel().catch(() => {});
    return response.ok;
  } catch {
    return false;
  }
}

/** Polls until `ok` holds and returns Date.now() of the first poll that saw it; throws after `timeoutMs`. */
export async function pollUntil(
  ok: () => Promise<boolean> | boolean,
  timeoutMs: number,
  what: string,
  intervalMs = 200,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await ok()) return Date.now();
    if (Date.now() > deadline) throw new Error(`${what}: not within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Starts the container if it is not running and waits for its ping. Safe to call at any time; the
 * restart test calls it after every round, in afterAll and in its global teardown, so Realtime is
 * never left stopped.
 */
export async function ensureRealtimeRunning(
  stack: StackEnv | null,
  name = realtimeContainer(),
): Promise<void> {
  if (!(await containerRunning(name))) await startContainer(name);
  if (stack) await pollUntil(() => realtimePing(stack), 90_000, "Realtime ping after start", 500);
}

/**
 * Pings Realtime every 100 ms in the background and keeps each change between answering and not, so a
 * round can say when Realtime went down and came back while it waits for other things.
 */
export class PingWatch {
  private readonly changes: Array<{ at: number; ok: boolean }> = [];
  private running = true;
  private readonly loop: Promise<void>;

  constructor(stack: StackEnv, intervalMs = 100) {
    this.loop = (async () => {
      let last: boolean | null = null;
      while (this.running) {
        const ok = await realtimePing(stack);
        if (ok !== last) {
          this.changes.push({ at: Date.now(), ok });
          last = ok;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    })();
  }

  /** The first change to `ok` at or after `from` (laptop ms), or null. */
  firstAt(ok: boolean, from: number): number | null {
    return this.changes.find((change) => change.ok === ok && change.at >= from)?.at ?? null;
  }

  /** Whether Realtime answered at `at`, by the last change before it; null before the first ping. */
  answeredAt(at: number): boolean | null {
    return this.changes.filter((change) => change.at <= at).at(-1)?.ok ?? null;
  }

  async waitFor(ok: boolean, from: number, timeoutMs: number, what: string): Promise<number> {
    await pollUntil(() => this.firstAt(ok, from) !== null, timeoutMs, what, 50);
    return this.firstAt(ok, from) ?? Date.now();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }
}

/** One way a command reached the window, and when (laptop ms). */
export type CommandPath = "broadcast" | "ingest" | "catch_up";
export interface Carrier {
  via: CommandPath;
  at: number;
}

interface Frame {
  at: number;
  socket: number;
  sent: boolean;
  text: string;
}

interface Reply {
  /** When Playwright reported the finished request (laptop ms), the clock every arrival uses. */
  at: number;
  via: Exclude<CommandPath, "broadcast">;
  body: string;
  /** Chromium's timing: when the request left (laptop ms) and how long until its last byte. */
  startedAt: number | null;
  durationMs: number | null;
  /** The HTTP status, or the network error of a request that failed. */
  outcome: number | string;
}

/** One ingest call, from Chromium's timing, with its HTTP status or network error. */
export interface IngestCall {
  startedAt: number;
  durationMs: number;
  outcome: number | string;
}

/** Phoenix's v2 text frame: [join_ref, ref, topic, event, payload]. */
type PhoenixFrame = [string | null, string | null, string, string, unknown];

function phoenix(text: string): PhoenixFrame | null {
  if (!text.startsWith("[")) return null;
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.length === 5 ? (value as PhoenixFrame) : null;
  } catch {
    return null;
  }
}

function requestTiming(request: Request): { startedAt: number | null; durationMs: number | null } {
  const timing = request.timing();
  return timing.startTime > 0 && timing.responseEnd > 0
    ? { startedAt: timing.startTime, durationMs: timing.responseEnd }
    : { startedAt: null, durationMs: null };
}

/**
 * Records the student window's Realtime sockets and its ingest and session_commands replies. Attach it
 * right after launch: Playwright reports only sockets opened after the listener.
 */
export class WindowNetwork {
  private readonly frames: Frame[] = [];
  private readonly replies: Reply[] = [];
  private readonly sockets: Array<{ id: number; openedAt: number; closedAt: number | null }> = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(page: Page) {
    page.on("websocket", (socket) => this.onSocket(socket));
    page.on("requestfinished", (request) => {
      const url = request.url();
      const via = url.includes("/functions/v1/ingest")
        ? "ingest"
        : url.includes("/rest/v1/session_commands") && request.method() === "GET"
          ? "catch_up"
          : null;
      if (!via) return;
      // Stamped here, like the Realtime frames, so arrivals compare on one clock. Playwright hears of
      // each a few ms after the window does (more on a loaded host).
      const at = Date.now();
      const timing = requestTiming(request);
      const read = request
        .response()
        .then(async (response) => ({ body: (await response?.text()) ?? "", status: response?.status() ?? 0 }))
        .then(
          ({ body, status }) => {
            this.replies.push({ at, via, body, ...timing, outcome: status });
          },
          () => {},
        )
        .finally(() => this.pending.delete(read));
      this.pending.add(read);
    });
    // An ingest call that never got a reply (reset, timeout): the app backs off and tries again.
    page.on("requestfailed", (request) => {
      if (!request.url().includes("/functions/v1/ingest")) return;
      const timing = request.timing();
      this.replies.push({
        at: Date.now(),
        via: "ingest",
        body: "",
        startedAt: timing.startTime > 0 ? timing.startTime : null,
        durationMs: timing.startTime > 0 ? Date.now() - timing.startTime : null,
        outcome: request.failure()?.errorText ?? "failed",
      });
    });
  }

  private onSocket(socket: WebSocket): void {
    if (!socket.url().includes("/realtime/v1/")) return;
    const id = this.sockets.length;
    const entry = { id, openedAt: Date.now(), closedAt: null as number | null };
    this.sockets.push(entry);
    const keep = (sent: boolean) => (frame: { payload: string | Buffer }) => {
      const text = typeof frame.payload === "string" ? frame.payload : frame.payload.toString("latin1");
      this.frames.push({ at: Date.now(), socket: id, sent, text });
      if (this.frames.length > 20_000) this.frames.shift();
    };
    socket.on("framereceived", keep(false));
    socket.on("framesent", keep(true));
    socket.on("close", () => {
      entry.closedAt = Date.now();
    });
    socket.on("socketerror", () => {
      entry.closedAt ??= Date.now();
    });
  }

  /** Waits for reply bodies still being read. */
  async settle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  /** Every arrival of the command at the window, earliest first. */
  carriers(commandId: string): Carrier[] {
    const found: Carrier[] = [];
    for (const frame of this.frames) {
      if (!frame.sent && frame.text.includes(commandId)) found.push({ via: "broadcast", at: frame.at });
    }
    for (const reply of this.replies) {
      if (reply.body.includes(commandId)) found.push({ via: reply.via, at: reply.at });
    }
    return found.sort((a, b) => a.at - b.at);
  }

  /** Ingest calls that left inside a window, oldest first, from Chromium's timing. */
  ingestCallsBetween(from: number, to: number): IngestCall[] {
    const calls: IngestCall[] = [];
    for (const reply of this.replies) {
      if (reply.via !== "ingest" || reply.startedAt === null || reply.durationMs === null) continue;
      if (reply.startedAt >= from && reply.startedAt <= to)
        calls.push({ startedAt: reply.startedAt, durationMs: reply.durationMs, outcome: reply.outcome });
    }
    return calls.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** Ms left of an ingest call in flight at `at` (laptop ms), from Chromium's timing; 0 when none. */
  ingestLeftInFlightAt(at: number): number {
    let left = 0;
    for (const reply of this.replies) {
      if (reply.via !== "ingest" || reply.startedAt === null || reply.durationMs === null) continue;
      const end = reply.startedAt + reply.durationMs;
      if (reply.startedAt <= at && end > at) left = Math.max(left, end - at);
    }
    return left;
  }

  /** The ingest call whose reply first carried a command, from Chromium's timing. */
  carryingIngestCall(commandId: string): IngestCall | null {
    const reply = this.replies
      .filter((r) => r.via === "ingest" && r.body.includes(commandId))
      .sort((a, b) => a.at - b.at)[0];
    return reply && reply.startedAt !== null && reply.durationMs !== null
      ? { startedAt: reply.startedAt, durationMs: reply.durationMs, outcome: reply.outcome }
      : null;
  }

  /** Ingest replies (laptop ms) inside a window, for the heartbeat's spacing. */
  ingestRepliesBetween(from: number, to: number): number[] {
    return this.replies
      .filter((reply) => reply.via === "ingest" && reply.at >= from && reply.at <= to)
      .map((reply) => reply.at)
      .sort((a, b) => a - b);
  }

  /**
   * When the session channel was joined (the ok reply to its phx_join), each time, laptop ms. A join
   * is matched to its reply by socket and ref.
   */
  channelJoins(sessionId: string): number[] {
    const topic = `realtime:${sessionTopic(sessionId)}`;
    const joins = new Set<string>();
    const joined: number[] = [];
    for (const frame of this.frames) {
      const message = phoenix(frame.text);
      if (!message || message[2] !== topic) continue;
      const [, ref, , event, payload] = message;
      if (frame.sent && event === "phx_join" && ref) joins.add(`${frame.socket}:${ref}`);
      if (
        !frame.sent &&
        event === "phx_reply" &&
        ref &&
        joins.has(`${frame.socket}:${ref}`) &&
        (payload as { status?: unknown } | null)?.status === "ok"
      ) {
        joined.push(frame.at);
      }
    }
    return joined;
  }

  /** Realtime sockets: opened and closed (laptop ms). */
  socketLog(): Array<{ openedAt: number; closedAt: number | null }> {
    return this.sockets.map(({ openedAt, closedAt }) => ({ openedAt, closedAt }));
  }

  /** Joins of the session channel between two times (laptop ms). */
  joinsBetween(sessionId: string, from: number, to: number): number[] {
    return this.channelJoins(sessionId).filter((at) => at >= from && at <= to);
  }

  /** True when a Realtime socket is open and the session channel's latest join came after it opened. */
  channelUp(sessionId: string): boolean {
    const open = this.sockets.filter((socket) => socket.closedAt === null).at(-1);
    if (!open) return false;
    const last = this.channelJoins(sessionId).at(-1);
    return last !== undefined && last >= open.openedAt;
  }
}

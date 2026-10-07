// The service worker's link with the Üki app ("Pairing (E.3)" in docs/phase-0-plan.md). It tries
// ws://127.0.0.1 on 47801, 47802 and 47803 at startup and every 2 s until one answers, says hello, pings
// every 5 s (from Chrome 116 WebSocket traffic keeps an extension service worker alive) and drops the link
// after three unanswered pings. A server that does not answer hello like the Üki app is left at once.
import {
  type AppToLock,
  encodeLockMessage,
  LOCK_HOST,
  LOCK_PORTS,
  LOCK_RECONNECT_INTERVAL_MS,
  type LockToApp,
  MISSED_PINGS_DOWN,
  PING_INTERVAL_MS,
  parseAppToLock,
} from "@uki/contracts";

/** The parts of the browser's WebSocket the link uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface AppLinkOptions {
  createSocket: (url: string) => SocketLike;
  /** Called when a socket opens; send hello from here. */
  onOpen: () => void;
  /** Every app message except ping and pong. */
  onMessage: (message: AppToLock) => void;
  /** The link went down (closed, refused, or three pings unanswered). */
  onClose: () => void;
  /** Runs on every retry while the app is away: an extension API call keeps the worker running. */
  keepAlive?: () => void;
  timers?: Timers;
  ports?: readonly number[];
  host?: string;
  retryMs?: number;
  pingMs?: number;
  /** How long the app has to answer hello before the Lock tries the next port. */
  helloTimeoutMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

export interface AppLink {
  start(): void;
  stop(): void;
  /** Sends when the socket is open; returns whether it did. */
  send(message: LockToApp): boolean;
  isOpen(): boolean;
}

const OPEN = 1;

export function createAppLink(options: AppLinkOptions): AppLink {
  const timers = options.timers ?? realTimers;
  const ports = options.ports ?? LOCK_PORTS;
  const host = options.host ?? LOCK_HOST;
  const retryMs = options.retryMs ?? LOCK_RECONNECT_INTERVAL_MS;
  const pingMs = options.pingMs ?? PING_INTERVAL_MS;
  const helloTimeoutMs = options.helloTimeoutMs ?? PING_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});

  let stopped = true;
  let socket: SocketLike | null = null;
  let open = false;
  let nextPort = 0;
  let missed = 0;
  let retryTimer: unknown = null;
  let pingTimer: unknown = null;
  let helloTimer: unknown = null;

  function clearTimers(): void {
    if (pingTimer !== null) timers.clearInterval(pingTimer);
    if (helloTimer !== null) timers.clearTimeout(helloTimer);
    pingTimer = null;
    helloTimer = null;
  }

  function scheduleRetry(): void {
    if (stopped) return;
    nextPort = 0;
    options.keepAlive?.();
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryMs);
  }

  function rawSend(target: SocketLike, message: LockToApp): boolean {
    if (target.readyState !== OPEN) return false;
    target.send(encodeLockMessage(message));
    return true;
  }

  function connect(): void {
    if (stopped || socket) return;
    const port = ports[nextPort];
    if (port === undefined) {
      scheduleRetry();
      return;
    }
    nextPort += 1;
    let candidate: SocketLike;
    try {
      candidate = options.createSocket(`ws://${host}:${port}`);
    } catch (error) {
      log(`could not open ws://${host}:${port}: ${String(error)}`);
      connect();
      return;
    }
    socket = candidate;
    let opened = false;
    let answered = false;

    candidate.onopen = () => {
      if (socket !== candidate) return;
      opened = true;
      open = true;
      missed = 0;
      helloTimer = timers.setTimeout(() => {
        if (!answered) {
          log(`no hello from ws://${host}:${port}`);
          candidate.close();
        }
      }, helloTimeoutMs);
      pingTimer = timers.setInterval(() => {
        if (missed >= MISSED_PINGS_DOWN) {
          log(`no answer to ${MISSED_PINGS_DOWN} pings`);
          candidate.close();
          drop();
          return;
        }
        missed += 1;
        rawSend(candidate, { type: "ping", at: now() });
      }, pingMs);
      options.onOpen();
    };

    candidate.onmessage = (event) => {
      if (socket !== candidate) return;
      missed = 0;
      if (typeof event.data !== "string") return;
      const parsed = parseAppToLock(event.data);
      if (!parsed.ok) {
        log(`ignored a frame from the app: ${parsed.error.slice(0, 200)}`);
        return;
      }
      const message = parsed.message;
      if (message.type === "ping") {
        rawSend(candidate, { type: "pong", at: now() });
        return;
      }
      if (message.type === "pong") return;
      if (message.type === "hello") answered = true;
      options.onMessage(message);
    };

    /**
     * The socket is gone. After a real session with the app, tell the controller and start over in 2 s;
     * a port that refused or never said hello like the app just moves the scan to the next port.
     */
    const drop = () => {
      if (socket !== candidate) return;
      socket = null;
      clearTimers();
      candidate.onopen = null;
      candidate.onmessage = null;
      candidate.onclose = null;
      candidate.onerror = null;
      if (opened) open = false;
      if (answered) {
        options.onClose();
        scheduleRetry();
      } else {
        connect();
      }
    };
    candidate.onclose = drop;
    candidate.onerror = () => {
      // A refused or failed socket closes next; close() makes sure of it.
      candidate.close();
    };
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      nextPort = 0;
      connect();
    },
    stop() {
      stopped = true;
      if (retryTimer !== null) timers.clearTimeout(retryTimer);
      retryTimer = null;
      clearTimers();
      const current = socket;
      socket = null;
      if (current) {
        current.onclose = null;
        current.close();
      }
      if (open) {
        open = false;
        options.onClose();
      }
    },
    send(message) {
      return socket !== null && open ? rawSend(socket, message) : false;
    },
    isOpen: () => open,
  };
}

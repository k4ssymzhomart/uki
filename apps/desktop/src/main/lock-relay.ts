// The app's side of the link with Üki Lock ("Pairing (E.3)" and "Lock messages" in docs/phase-0-plan.md):
// a WebSocket server on 127.0.0.1 at the first free port of LOCK_PORTS. It accepts one connection at a time,
// and only from the Üki Lock origin, so no web page can connect. Every frame is parsed with the contracts'
// Zod schemas. Pairing: the Lock sends pair.request, the app makes a 6-digit code with crypto.randomInt
// (valid 2 minutes), shows it on its pairing card and sends pair.code; pair.confirm with the same code
// stores the pairing. Both sides ping every 5 s; three missed answers close the link. The app's exam.state
// is resent on every change and every 5 s.
//
// The module imports no Electron API: the main process passes a PairingStore that writes a JSON file in
// app.getPath("userData"), and the tests run it in plain Node with a real ws client.
import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { dirname } from "node:path";
import type { Duplex } from "node:stream";
import {
  type AppToLock,
  type DesktopOs,
  EXAM_STATE_INTERVAL_MS,
  encodeLockMessage,
  LOCK_HOST,
  LOCK_MAX_MESSAGE_CHARS,
  LOCK_PORTS,
  type LockStatus,
  type LockToApp,
  lockOrigin,
  MISSED_PINGS_DOWN,
  PAIR_CODE_TTL_MS,
  PING_INTERVAL_MS,
  parseLockMessage,
  Uuid,
} from "@uki/contracts";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

/** Development only: any Chromium extension origin, used when VITE_LOCK_EXTENSION_ID is unset. */
export const ANY_EXTENSION_ORIGIN = "chrome-extension://*";

/** Chromium extension ids are 32 letters a to p. */
const EXTENSION_ID = /^[a-p]{32}$/;

/** How often the server tries the ports again when all three are taken. */
const REBIND_INTERVAL_MS = 10_000;

export interface LockRelayLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const consoleLog: LockRelayLog = {
  info: (message) => console.info(`[lock-relay] ${message}`),
  warn: (message) => console.warn(`[lock-relay] ${message}`),
  error: (message) => console.error(`[lock-relay] ${message}`),
};

/**
 * The Origin the relay accepts. With an extension id it is exactly `chrome-extension://<id>`. Without one,
 * development builds accept any extension origin and say so loudly; packaged builds accept nothing.
 */
export function resolveLockOrigin(
  extensionId: string | undefined,
  options: { dev: boolean; log?: LockRelayLog },
): string {
  const log = options.log ?? consoleLog;
  const id = extensionId?.trim() ?? "";
  if (id !== "") {
    if (!EXTENSION_ID.test(id)) log.warn(`VITE_LOCK_EXTENSION_ID "${id}" is not a Chromium extension id`);
    return lockOrigin(id);
  }
  if (options.dev) {
    log.warn(
      "!!! VITE_LOCK_EXTENSION_ID is not set: this development build accepts ANY chrome-extension:// origin " +
        "on the Üki Lock socket. Set it (docs/runbooks/lock-pairing.md) before testing pairing for real. !!!",
    );
    return ANY_EXTENSION_ORIGIN;
  }
  log.error("VITE_LOCK_EXTENSION_ID is not set: the Üki Lock socket refuses every connection");
  return "";
}

/**
 * Whether a connection's Origin header may open the socket. Edge reports its extension pages as
 * `extension://<id>` in places, so that spelling of the same id passes too; web pages cannot send either.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigin: string): boolean {
  if (typeof origin !== "string" || allowedOrigin === "") return false;
  if (allowedOrigin === ANY_EXTENSION_ORIGIN) {
    const match = /^(?:chrome-)?extension:\/\/([^/]+)$/.exec(origin);
    return match?.[1] !== undefined && EXTENSION_ID.test(match[1]);
  }
  if (origin === allowedOrigin) return true;
  const id = allowedOrigin.replace(/^chrome-extension:\/\//, "");
  return id !== allowedOrigin && origin === `extension://${id}`;
}

/** The pairing the app remembers: the Lock install that confirmed a code. */
export const LockPairing = z.object({
  install_id: Uuid,
  paired_at: z.iso.datetime(),
  browser: z.string().max(40).optional(),
  lock_version: z.string().max(32).optional(),
});
export type LockPairing = z.infer<typeof LockPairing>;

/** Where the pairing lives. The main process passes a file in userData; tests use memory. */
export interface PairingStore {
  load(): Promise<LockPairing | null>;
  save(pairing: LockPairing | null): Promise<void>;
}

const PairingFile = z.object({ version: z.literal(1), pairing: LockPairing.nullable() });

/** A JSON file, written atomically. A missing or unreadable file means not paired. */
export function createFilePairingStore(path: string): PairingStore {
  return {
    async load() {
      try {
        const parsed = PairingFile.safeParse(JSON.parse(await readFile(path, "utf8")));
        return parsed.success ? parsed.data.pairing : null;
      } catch {
        return null;
      }
    },
    async save(pairing) {
      await mkdir(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify({ version: 1, pairing }), { encoding: "utf8", mode: 0o600 });
      await rename(temp, path);
    },
  };
}

export function createMemoryPairingStore(initial: LockPairing | null = null): PairingStore {
  let pairing = initial;
  return {
    load: async () => pairing,
    save: async (next) => {
      pairing = next;
    },
  };
}

/** What the app tells the Lock in its hello. */
export interface LockRelayAppInfo {
  app_version: string;
  os: DesktopOs;
  /** The joined student's name for the E.3 popup; null (or left out) before join. */
  student_name?: string | null;
}

/** The code on the app's pairing card (E.3) while a Lock pairs. */
export interface PairCode {
  code: string;
  /** ISO 8601 UTC. */
  expires_at: string;
}

export interface LockRelayOptions {
  /** `chrome-extension://<Üki Lock id>`, ANY_EXTENSION_ORIGIN in development, or "" to refuse everyone. */
  allowedOrigin: string;
  /** Read at every hello. Pass a function so the student name follows the join. */
  appInfo: (() => LockRelayAppInfo) | LockRelayAppInfo;
  /**
   * Messages from the Lock, for the renderer (window.uki.lock.onMessage). Ping and pong stay inside the
   * relay. Before pairing only hello and pair.request pass; after pairing everything else does too.
   */
  onMessage: (message: LockToApp) => void;
  onStatus: (status: LockStatus) => void;
  /** The pairing code to show on the app's card, or null once it is used, expired or the Lock left. */
  onPairCode?: (code: PairCode | null) => void;
  store?: PairingStore;
  /** Defaults to LOCK_PORTS; tests pass free ephemeral ports. */
  ports?: readonly number[];
  pingIntervalMs?: number;
  examStateIntervalMs?: number;
  pairCodeTtlMs?: number;
  rebindIntervalMs?: number;
  now?: () => number;
  /** Six digits; defaults to crypto.randomInt. */
  makeCode?: () => string;
  log?: LockRelayLog;
}

export interface LockRelay {
  status(): LockStatus;
  /** The port the server listens on, or null while none of the ports was free. */
  port(): number | null;
  /** Resolves once the first bind attempt finished, with the port or null. */
  readonly ready: Promise<number | null>;
  /**
   * Sends a message to the Lock. exam.state is also remembered and resent every 5 s and after pairing.
   * exam.state, lock.start and lock.release reach only a paired Lock. Returns whether it was sent.
   */
  send(message: AppToLock): boolean;
  /** Makes a fresh code for the connected Lock (as on pair.request), sends pair.code and returns it. */
  startPairing(): PairCode | null;
  close(): Promise<void>;
}

/** Six digits from crypto.randomInt, leading zeros kept. */
export function makePairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

interface Client {
  socket: WebSocket;
  installId: string | null;
  browser: string | null;
  lockVersion: string | null;
  paired: boolean;
  missed: number;
  pingTimer: ReturnType<typeof setInterval>;
}

const PAIRED_ONLY: ReadonlySet<AppToLock["type"]> = new Set(["exam.state", "lock.start", "lock.release"]);

export function createLockRelay(options: LockRelayOptions): LockRelay {
  const log = options.log ?? consoleLog;
  const store = options.store ?? createMemoryPairingStore();
  const ports = options.ports ?? LOCK_PORTS;
  const pingIntervalMs = options.pingIntervalMs ?? PING_INTERVAL_MS;
  const examStateIntervalMs = options.examStateIntervalMs ?? EXAM_STATE_INTERVAL_MS;
  const pairCodeTtlMs = options.pairCodeTtlMs ?? PAIR_CODE_TTL_MS;
  const rebindIntervalMs = options.rebindIntervalMs ?? REBIND_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const makeCode = options.makeCode ?? makePairCode;

  const wss = new WebSocketServer({ noServer: true, maxPayload: LOCK_MAX_MESSAGE_CHARS * 4 });
  let server: Server | null = null;
  let boundPort: number | null = null;
  let client: Client | null = null;
  let currentStatus: LockStatus = "absent";
  let pairCode: (PairCode & { expiresMs: number }) | null = null;
  let pairCodeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastExamState: Extract<AppToLock, { type: "exam.state" }> | null = null;
  let rebindTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const pairingLoaded = store.load().catch((error: unknown) => {
    log.warn(`could not read the pairing: ${String(error)}`);
    return null;
  });
  let pairing: LockPairing | null = null;
  void pairingLoaded.then((value) => {
    pairing = value;
  });

  const examStateTimer = setInterval(() => {
    if (lastExamState && client?.paired) write(client, lastExamState);
  }, examStateIntervalMs);

  function setStatus(next: LockStatus): void {
    if (next === currentStatus) return;
    currentStatus = next;
    options.onStatus(next);
  }

  function write(target: Client, message: AppToLock): boolean {
    if (target.socket.readyState !== target.socket.OPEN) return false;
    target.socket.send(encodeLockMessage(message));
    return true;
  }

  function clearPairCode(): void {
    if (pairCodeTimer) clearTimeout(pairCodeTimer);
    pairCodeTimer = null;
    if (pairCode) {
      pairCode = null;
      options.onPairCode?.(null);
    }
  }

  function startPairing(): PairCode | null {
    if (!client || client.installId === null) return null;
    clearPairCode();
    const expiresMs = now() + pairCodeTtlMs;
    const next = { code: makeCode(), expires_at: new Date(expiresMs).toISOString(), expiresMs };
    pairCode = next;
    pairCodeTimer = setTimeout(clearPairCode, pairCodeTtlMs);
    write(client, { type: "pair.code", code: next.code, expires_at: next.expires_at });
    const shown = { code: next.code, expires_at: next.expires_at };
    options.onPairCode?.(shown);
    return shown;
  }

  async function confirmPairing(target: Client, code: string): Promise<void> {
    const pending = pairCode;
    if (!pending || target.installId === null) {
      write(target, { type: "pair.fail", reason: "no_code" });
      return;
    }
    if (now() > pending.expiresMs) {
      clearPairCode();
      write(target, { type: "pair.fail", reason: "expired" });
      return;
    }
    if (code !== pending.code) {
      // A wrong code spends the code: the Lock asks for a new one, so codes cannot be guessed in a row.
      clearPairCode();
      write(target, { type: "pair.fail", reason: "wrong_code" });
      return;
    }
    clearPairCode();
    const record: LockPairing = {
      install_id: target.installId,
      paired_at: new Date(now()).toISOString(),
      ...(target.browser ? { browser: target.browser } : {}),
      ...(target.lockVersion ? { lock_version: target.lockVersion } : {}),
    };
    pairing = record;
    try {
      await store.save(record);
    } catch (error) {
      log.error(`could not store the pairing: ${String(error)}`);
    }
    if (client !== target) return;
    target.paired = true;
    write(target, { type: "pair.ok" });
    setStatus("paired");
    if (lastExamState) write(target, lastExamState);
  }

  async function handleFrame(target: Client, data: RawData, isBinary: boolean): Promise<void> {
    target.missed = 0;
    if (isBinary) {
      log.warn("ignored a binary frame");
      return;
    }
    const parsed = parseLockMessage(rawToString(data), "lock");
    if (!parsed.ok) {
      log.warn(`ignored a frame that is not a Lock message: ${parsed.error.slice(0, 200)}`);
      return;
    }
    const message = parsed.message;
    switch (message.type) {
      case "ping":
        write(target, { type: "pong", at: now() });
        return;
      case "pong":
        return;
      case "hello": {
        await pairingLoaded;
        if (client !== target) return;
        target.installId = message.install_id;
        target.browser = message.browser;
        target.lockVersion = message.lock_version;
        target.paired = pairing?.install_id === message.install_id;
        const info = typeof options.appInfo === "function" ? options.appInfo() : options.appInfo;
        write(target, {
          type: "hello",
          app_version: info.app_version,
          os: info.os,
          paired: target.paired,
          student_name: info.student_name ?? null,
        });
        setStatus(target.paired ? "paired" : "connected");
        if (target.paired && lastExamState) write(target, lastExamState);
        options.onMessage(message);
        return;
      }
      case "pair.request":
        if (target.installId === null) {
          write(target, { type: "pair.fail", reason: "no_code" });
          return;
        }
        startPairing();
        options.onMessage(message);
        return;
      case "pair.confirm":
        await confirmPairing(target, message.code);
        return;
      default:
        if (!target.paired) {
          log.warn(`ignored ${message.type} from a Lock that is not paired`);
          return;
        }
        options.onMessage(message);
    }
  }

  function attach(socket: WebSocket): void {
    const target: Client = {
      socket,
      installId: null,
      browser: null,
      lockVersion: null,
      paired: false,
      missed: 0,
      pingTimer: setInterval(() => {
        if (target.missed >= MISSED_PINGS_DOWN) {
          log.warn(`no answer to ${MISSED_PINGS_DOWN} pings: closing the Lock link`);
          socket.terminate();
          return;
        }
        target.missed += 1;
        write(target, { type: "ping", at: now() });
      }, pingIntervalMs),
    };
    client = target;
    setStatus("connected");
    socket.on("message", (data, isBinary) => {
      handleFrame(target, data, isBinary).catch((error: unknown) =>
        log.error(`failed to handle a Lock frame: ${String(error)}`),
      );
    });
    socket.on("error", (error) => log.warn(`socket error: ${error.message}`));
    socket.on("close", () => {
      clearInterval(target.pingTimer);
      if (client !== target) return;
      client = null;
      clearPairCode();
      setStatus("absent");
    });
  }

  function refuse(socket: Duplex, status: number, reason: string): void {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, options.allowedOrigin)) {
      log.warn(`refused a connection from origin ${origin ?? "(none)"}`);
      refuse(socket, 403, "Forbidden");
      return;
    }
    if (client) {
      refuse(socket, 409, "Conflict");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (closed || client) {
        ws.terminate();
        return;
      }
      attach(ws);
    });
  }

  function listenOn(port: number): Promise<Server | null> {
    return new Promise((resolve) => {
      const candidate = createServer((_req, res) => {
        res.writeHead(426, { Connection: "close" }).end();
      });
      candidate.on("upgrade", onUpgrade);
      const onError = (error: NodeJS.ErrnoException) => {
        candidate.removeAllListeners();
        if (error.code !== "EADDRINUSE" && error.code !== "EACCES")
          log.warn(`port ${port}: ${error.message}`);
        resolve(null);
      };
      candidate.once("error", onError);
      candidate.listen({ port, host: LOCK_HOST, exclusive: true }, () => {
        candidate.off("error", onError);
        candidate.on("error", (error) => log.error(`server error: ${error.message}`));
        resolve(candidate);
      });
    });
  }

  async function bind(): Promise<number | null> {
    for (const port of ports) {
      if (closed) return null;
      const bound = await listenOn(port);
      if (!bound) continue;
      if (closed) {
        bound.close();
        return null;
      }
      server = bound;
      boundPort = port;
      log.info(`listening on ${LOCK_HOST}:${port}`);
      return port;
    }
    log.error(`ports ${ports.join(", ")} are all taken; trying again in ${rebindIntervalMs / 1000} s`);
    rebindTimer = setTimeout(() => void bind(), rebindIntervalMs);
    return null;
  }

  const ready = bind();

  return {
    status: () => currentStatus,
    port: () => boundPort,
    ready,
    send(message) {
      if (message.type === "exam.state") lastExamState = message;
      if (!client) return false;
      if (PAIRED_ONLY.has(message.type) && !client.paired) return false;
      return write(client, message);
    },
    startPairing,
    async close() {
      closed = true;
      clearInterval(examStateTimer);
      if (rebindTimer) clearTimeout(rebindTimer);
      clearPairCode();
      if (client) {
        clearInterval(client.pingTimer);
        client.socket.terminate();
      }
      wss.close();
      const current = server;
      server = null;
      boundPort = null;
      if (current) await new Promise<void>((resolve) => current.close(() => resolve()));
    },
  };
}

function rawToString(data: RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

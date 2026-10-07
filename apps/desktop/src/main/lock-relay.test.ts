// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AppToLock,
  encodeLockMessage,
  type LockStatus,
  type LockToApp,
  parseAppToLock,
  uuidv7,
} from "@uki/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { LockLink } from "../renderer/services/lock-link.ts";
import {
  ANY_EXTENSION_ORIGIN,
  createFilePairingStore,
  createLockRelay,
  createMemoryPairingStore,
  isOriginAllowed,
  type LockRelay,
  type LockRelayOptions,
  makePairCode,
  type PairCode,
  resolveLockOrigin,
} from "./lock-relay.ts";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const relays: LockRelay[] = [];
const sockets: WebSocket[] = [];
const blockers: NetServer[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(relays.splice(0).map((relay) => relay.close()));
  await Promise.all(blockers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

/** Ports the OS says are free right now. */
async function freePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<NetServer>((resolve) => {
          const server = createNetServer();
          server.listen(0, "127.0.0.1", () => resolve(server));
        }),
    ),
  );
  const ports = servers.map((s) => {
    const address = s.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    return address.port;
  });
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  return ports;
}

interface Harness {
  relay: LockRelay;
  port: number;
  statuses: LockStatus[];
  messages: LockToApp[];
  codes: (PairCode | null)[];
}

async function startRelay(overrides: Partial<LockRelayOptions> = {}): Promise<Harness> {
  const statuses: LockStatus[] = [];
  const messages: LockToApp[] = [];
  const codes: (PairCode | null)[] = [];
  const relay = createLockRelay({
    allowedOrigin: ORIGIN,
    appInfo: () => ({ app_version: "0.1.0", os: "macos", student_name: "Aliya S." }),
    onMessage: (message) => messages.push(message),
    onStatus: (status) => statuses.push(status),
    onPairCode: (code) => codes.push(code),
    ports: await freePorts(3),
    log: quiet,
    ...overrides,
  });
  relays.push(relay);
  const port = await relay.ready;
  if (port === null) throw new Error("the relay did not bind");
  return { relay, port, statuses, messages, codes };
}

/** A Lock stand-in: a real ws client with an inbox of parsed app messages. */
interface FakeLock {
  socket: WebSocket;
  inbox: AppToLock[];
  send(message: LockToApp): void;
  next<T extends AppToLock["type"]>(type: T, timeoutMs?: number): Promise<Extract<AppToLock, { type: T }>>;
  closed: Promise<void>;
}

function connect(port: number, origin: string | null = ORIGIN): Promise<FakeLock> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, origin === null ? {} : { origin });
    sockets.push(socket);
    const inbox: AppToLock[] = [];
    const waiters: Array<() => void> = [];
    const closed = new Promise<void>((resolveClosed) => socket.on("close", () => resolveClosed()));
    socket.on("message", (data) => {
      const parsed = parseAppToLock(String(data));
      if (parsed.ok) inbox.push(parsed.message);
      for (const wake of waiters.splice(0)) wake();
    });
    socket.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    socket.on("error", reject);
    socket.on("open", () =>
      resolve({
        socket,
        inbox,
        closed,
        send: (message) => socket.send(encodeLockMessage(message)),
        next(type, timeoutMs = 2000) {
          return new Promise((resolveNext, rejectNext) => {
            const timer = setTimeout(
              () => rejectNext(new Error(`no ${type} within ${timeoutMs} ms`)),
              timeoutMs,
            );
            const check = () => {
              const index = inbox.findIndex((m) => m.type === type);
              if (index >= 0) {
                clearTimeout(timer);
                const [found] = inbox.splice(index, 1);
                resolveNext(found as Extract<AppToLock, { type: typeof type }>);
              } else waiters.push(check);
            };
            check();
          });
        },
      }),
    );
  });
}

function hello(installId: string, browser = "chrome"): LockToApp {
  return { type: "hello", lock_version: "0.0.0", browser, install_id: installId };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const EXAM_STATE: Extract<AppToLock, { type: "exam.state" }> = {
  type: "exam.state",
  phase: "ready",
  watch: "watching",
  locale: "kk",
  exam: {
    session_id: "0192f3a0-0000-7000-8000-000000000001",
    mode: "browser",
    title: "Physics 1 · Quiz 3",
    starts_at: "2026-10-07T09:00:00Z",
    ends_at: "2026-10-07T09:40:00Z",
    allowed_hosts: ["localhost:5180"],
    lms_url: "http://localhost:5180/physics-1/quiz-3",
    done_path: "/physics-1/quiz-3/review",
  },
};

describe("origin rules", () => {
  it("accepts only the Üki Lock origin", () => {
    expect(isOriginAllowed(ORIGIN, ORIGIN)).toBe(true);
    expect(isOriginAllowed(`extension://${EXTENSION_ID}`, ORIGIN)).toBe(true);
    expect(isOriginAllowed("chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", ORIGIN)).toBe(false);
    expect(isOriginAllowed("https://evil.example", ORIGIN)).toBe(false);
    expect(isOriginAllowed("null", ORIGIN)).toBe(false);
    expect(isOriginAllowed(undefined, ORIGIN)).toBe(false);
    expect(isOriginAllowed(ORIGIN, "")).toBe(false);
  });

  it("accepts any extension origin, and no web page, in development without an id", () => {
    expect(isOriginAllowed(ORIGIN, ANY_EXTENSION_ORIGIN)).toBe(true);
    expect(isOriginAllowed("https://abcdefghijklmnopabcdefghijklmnop.example", ANY_EXTENSION_ORIGIN)).toBe(
      false,
    );
    expect(isOriginAllowed("chrome-extension://not-an-id", ANY_EXTENSION_ORIGIN)).toBe(false);
  });

  it("resolves the origin from VITE_LOCK_EXTENSION_ID and says loudly when it is missing", () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    expect(resolveLockOrigin(EXTENSION_ID, { dev: false, log })).toBe(ORIGIN);
    expect(resolveLockOrigin(undefined, { dev: true, log })).toBe(ANY_EXTENSION_ORIGIN);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("ANY chrome-extension://"));
    expect(resolveLockOrigin("", { dev: false, log })).toBe("");
    expect(log.error).toHaveBeenCalled();
  });

  it("makes six-digit codes", () => {
    for (let i = 0; i < 50; i += 1) expect(makePairCode()).toMatch(/^\d{6}$/);
  });
});

describe("createLockRelay", () => {
  it("listens on 127.0.0.1 at the first free port", async () => {
    const ports = await freePorts(3);
    const blocker = createNetServer();
    blockers.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(ports[0], "127.0.0.1", resolve));
    const { relay } = await startRelay({ ports });
    expect(relay.port()).toBe(ports[1]);
  });

  it("refuses connections from another origin or without one", async () => {
    const { port, relay, statuses } = await startRelay();
    await expect(connect(port, "https://evil.example")).rejects.toThrow("HTTP 403");
    await expect(connect(port, null)).rejects.toThrow("HTTP 403");
    await expect(connect(port, "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).rejects.toThrow(
      "HTTP 403",
    );
    expect(relay.status()).toBe("absent");
    expect(statuses).toEqual([]);
  });

  it("takes one Lock at a time", async () => {
    const { port } = await startRelay();
    await connect(port);
    await expect(connect(port)).rejects.toThrow("HTTP 409");
  });

  it("pairs with the code it showed, stores the pairing and knows the Lock next time", async () => {
    const store = createMemoryPairingStore();
    const { port, relay, statuses, messages, codes } = await startRelay({ store });
    const installId = uuidv7();
    const lock = await connect(port);
    lock.send(hello(installId));
    expect(await lock.next("hello")).toEqual({
      type: "hello",
      app_version: "0.1.0",
      os: "macos",
      paired: false,
      student_name: "Aliya S.",
    });
    expect(relay.status()).toBe("connected");

    lock.send({ type: "pair.request" });
    const offered = await lock.next("pair.code");
    expect(offered.code).toMatch(/^\d{6}$/);
    expect(codes).toEqual([{ code: offered.code, expires_at: offered.expires_at }]);
    expect(messages.map((m) => m.type)).toEqual(["hello", "pair.request"]);

    lock.send({ type: "pair.confirm", code: offered.code });
    await lock.next("pair.ok");
    expect(relay.status()).toBe("paired");
    expect(statuses).toEqual(["connected", "paired"]);
    expect(codes.at(-1)).toBeNull();
    expect((await store.load())?.install_id).toBe(installId);

    lock.socket.close();
    await lock.closed;
    await waitFor(() => relay.status() === "absent");

    const again = await connect(port);
    again.send(hello(installId));
    expect((await again.next("hello")).paired).toBe(true);
    expect(relay.status()).toBe("paired");
  });

  it("refuses a wrong code and spends it", async () => {
    const { port, relay } = await startRelay({ makeCode: () => "482913" });
    const lock = await connect(port);
    lock.send(hello(uuidv7()));
    await lock.next("hello");
    lock.send({ type: "pair.request" });
    await lock.next("pair.code");
    lock.send({ type: "pair.confirm", code: "000000" });
    expect(await lock.next("pair.fail")).toEqual({ type: "pair.fail", reason: "wrong_code" });
    lock.send({ type: "pair.confirm", code: "482913" });
    expect(await lock.next("pair.fail")).toEqual({ type: "pair.fail", reason: "no_code" });
    expect(relay.status()).toBe("connected");
  });

  it("refuses a code after its 2 minutes", async () => {
    let clock = Date.parse("2026-10-07T09:00:00Z");
    const { port, relay } = await startRelay({ now: () => clock });
    const lock = await connect(port);
    lock.send(hello(uuidv7()));
    await lock.next("hello");
    lock.send({ type: "pair.request" });
    const offered = await lock.next("pair.code");
    expect(offered.expires_at).toBe("2026-10-07T09:02:00.000Z");
    clock += 120_001;
    lock.send({ type: "pair.confirm", code: offered.code });
    expect(await lock.next("pair.fail")).toEqual({ type: "pair.fail", reason: "expired" });
    expect(relay.status()).toBe("connected");
  });

  it("clears the code on the app's card when it runs out", async () => {
    const { port, codes } = await startRelay({ pairCodeTtlMs: 40 });
    const lock = await connect(port);
    lock.send(hello(uuidv7()));
    await lock.next("hello");
    lock.send({ type: "pair.request" });
    await lock.next("pair.code");
    await waitFor(() => codes.length === 2);
    expect(codes[1]).toBeNull();
  });

  it("closes the link after three unanswered pings", async () => {
    const { port, relay, statuses } = await startRelay({ pingIntervalMs: 30 });
    const silent = await connect(port);
    expect(relay.status()).toBe("connected");
    await silent.closed;
    expect(silent.inbox.filter((m) => m.type === "ping")).toHaveLength(3);
    await waitFor(() => relay.status() === "absent");
    expect(statuses).toEqual(["connected", "absent"]);
  });

  it("keeps a Lock that answers its pings, and answers the Lock's own pings", async () => {
    const { port, relay } = await startRelay({ pingIntervalMs: 30 });
    const lock = await connect(port);
    lock.socket.on("message", (data) => {
      if (String(data).includes('"ping"')) lock.send({ type: "pong" });
    });
    lock.send({ type: "ping", at: 1 });
    await lock.next("pong");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(relay.status()).toBe("connected");
    expect(lock.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("passes Lock events on only once paired, and ignores frames that fail the schema", async () => {
    const store = createMemoryPairingStore();
    const installId = uuidv7();
    await store.save({ install_id: installId, paired_at: "2026-10-07T08:00:00.000Z" });
    const { port, messages } = await startRelay({ store });

    const stranger = await connect(port);
    stranger.send(hello(uuidv7()));
    await stranger.next("hello");
    stranger.send({ type: "lock.started", tabs_closed: 3 });
    stranger.socket.send("not json");
    stranger.socket.send(JSON.stringify({ type: "lock.started", tabs_closed: -1 }));
    stranger.send({ type: "ping" });
    await stranger.next("pong");
    expect(messages.map((m) => m.type)).toEqual(["hello"]);
    stranger.socket.close();
    await stranger.closed;

    await new Promise((resolve) => setTimeout(resolve, 20));
    const lock = await connect(port);
    lock.send(hello(installId));
    expect((await lock.next("hello")).paired).toBe(true);
    const event: LockToApp = {
      type: "lock.event",
      event: { id: uuidv7(), at: "2026-10-07T09:10:00.000Z", type: "tab.blocked", data: { host: null } },
    };
    lock.send(event);
    lock.send({ type: "ping" });
    await lock.next("pong");
    expect(messages.at(-1)).toEqual(event);
  });

  it("sends exam.state only to a paired Lock: after pairing, on change and every few seconds", async () => {
    const { port, relay } = await startRelay({ examStateIntervalMs: 40 });
    expect(relay.send(EXAM_STATE)).toBe(false);
    const lock = await connect(port);
    lock.send(hello(uuidv7()));
    await lock.next("hello");
    expect(relay.send(EXAM_STATE)).toBe(false);
    expect(relay.send({ type: "lock.start" })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(lock.inbox.some((m) => m.type === "exam.state")).toBe(false);

    const offered = relay.startPairing();
    expect(offered?.code).toMatch(/^\d{6}$/);
    lock.send({ type: "pair.confirm", code: (await lock.next("pair.code")).code });
    await lock.next("pair.ok");
    expect(await lock.next("exam.state")).toEqual(EXAM_STATE);
    expect(await lock.next("exam.state", 500)).toEqual(EXAM_STATE);
    expect(relay.send({ type: "lock.start" })).toBe(true);
    await lock.next("lock.start");
  });

  it("refuses to pair before the Lock said hello", async () => {
    const { port, relay } = await startRelay();
    const lock = await connect(port);
    expect(relay.startPairing()).toBeNull();
    lock.send({ type: "pair.request" });
    expect(await lock.next("pair.fail")).toEqual({ type: "pair.fail", reason: "no_code" });
  });

  it("keeps the pairing while a Lock holds the browser: another browser's Lock cannot pair", async () => {
    const store = createMemoryPairingStore();
    const chrome = uuidv7();
    await store.save({ install_id: chrome, paired_at: "2026-10-07T08:00:00.000Z" });
    const { port, relay, messages, codes } = await startRelay({ store, makeCode: () => "482913" });
    relay.send(EXAM_STATE);
    const locked = await connect(port);
    locked.send(hello(chrome));
    expect((await locked.next("hello")).paired).toBe(true);
    locked.send({ type: "lock.started", tabs_closed: 2 });
    await waitFor(() => messages.some((m) => m.type === "lock.started"));
    // The student quits Chrome; Edge's Lock, never paired, takes the one slot.
    locked.socket.close();
    await locked.closed;
    await waitFor(() => relay.status() === "absent");
    const edge = await connect(port);
    edge.send(hello(uuidv7(), "edge"));
    expect((await edge.next("hello")).paired).toBe(false);

    edge.send({ type: "pair.request" });
    expect(await edge.next("pair.fail")).toEqual({ type: "pair.fail", reason: "no_code" });
    expect(relay.startPairing()).toBeNull();
    edge.send({ type: "pair.confirm", code: "482913" });
    expect(await edge.next("pair.fail")).toEqual({ type: "pair.fail", reason: "no_code" });
    expect(edge.inbox.some((m) => m.type === "pair.code")).toBe(false);
    expect(codes).toEqual([]);
    expect(messages.map((m) => m.type)).not.toContain("pair.request");
    expect(relay.status()).toBe("connected");
    expect((await store.load())?.install_id).toBe(chrome);

    // Once the app releases the lock, pairing works again.
    relay.send({ type: "lock.release", reason: "submitted" });
    edge.send({ type: "pair.request" });
    expect((await edge.next("pair.code")).code).toBe("482913");
  });

  it("refuses to pair while exam.state says the exam runs, and pairs again once it is done", async () => {
    const { port, relay } = await startRelay();
    const lock = await connect(port);
    lock.send(hello(uuidv7()));
    await lock.next("hello");
    for (const phase of ["writing", "paused"] as const) {
      relay.send({ ...EXAM_STATE, phase });
      lock.send({ type: "pair.request" });
      expect(await lock.next("pair.fail")).toEqual({ type: "pair.fail", reason: "no_code" });
    }
    relay.send({ ...EXAM_STATE, phase: "done" });
    lock.send({ type: "pair.request" });
    await lock.next("pair.code");
  });

  it("with the renderer's LockLink: another browser's Lock taking the slot is reported", async () => {
    const store = createMemoryPairingStore();
    const chrome = uuidv7();
    await store.save({ install_id: chrome, paired_at: "2026-10-07T08:00:00.000Z" });
    const messageListeners = new Set<(message: LockToApp) => void>();
    const statusListeners = new Set<(status: LockStatus) => void>();
    const { port, relay } = await startRelay({
      store,
      onMessage: (message) => {
        for (const listener of messageListeners) listener(message);
      },
      onStatus: (status) => {
        for (const listener of statusListeners) listener(status);
      },
    });
    let clock = Date.parse("2026-10-07T09:10:00Z");
    const disconnects: number[] = [];
    const link = new LockLink({
      bridge: {
        lock: {
          status: async () => relay.status(),
          send: async (message) => {
            relay.send(message);
          },
          onMessage: (listener) => {
            messageListeners.add(listener);
            return () => messageListeners.delete(listener);
          },
          onStatus: (listener) => {
            statusListeners.add(listener);
            return () => statusListeners.delete(listener);
          },
          onPairCode: () => () => {},
        },
      },
      onStarted: () => {},
      onSubmitted: () => {},
      onEvent: () => {},
      onDisconnected: () => disconnects.push(clock),
      now: () => clock,
    });
    link.start();
    try {
      link.update(EXAM_STATE);
      const locked = await connect(port);
      locked.send(hello(chrome));
      await locked.next("hello");
      locked.send({ type: "lock.started", tabs_closed: 2 });
      await waitFor(() => link.isLocked);
      link.update({ ...EXAM_STATE, phase: "writing" });

      locked.socket.close();
      await locked.closed;
      await waitFor(() => relay.status() === "absent");
      const edge = await connect(port);
      edge.send(hello(uuidv7(), "edge"));
      await edge.next("hello");
      edge.send({ type: "pair.request" });
      await edge.next("pair.fail");

      // 60 s of the renderer's 2-second poll while Edge's unpaired Lock holds the slot.
      for (let i = 0; i < 30; i += 1) {
        clock += 2000;
        await link.poll();
      }
      expect(relay.status()).toBe("connected");
      expect(disconnects).toHaveLength(1);
    } finally {
      link.stop();
    }
  });
});

describe("createFilePairingStore", () => {
  it("writes the pairing as JSON and reads it back; a broken file means not paired", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uki-lock-relay-"));
    try {
      const path = join(dir, "nested", "lock-pairing.json");
      const store = createFilePairingStore(path);
      expect(await store.load()).toBeNull();
      const pairing = { install_id: uuidv7(), paired_at: "2026-10-07T09:00:00.000Z", browser: "chrome" };
      await store.save(pairing);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ version: 1, pairing });
      expect(await createFilePairingStore(path).load()).toEqual(pairing);
      await store.save(null);
      expect(await store.load()).toBeNull();
      const broken = createFilePairingStore(join(dir, "broken.json"));
      await import("node:fs/promises").then((fs) => fs.writeFile(join(dir, "broken.json"), "{"));
      expect(await broken.load()).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// @vitest-environment node
// The relay's one slot when Üki Lock is installed in two browsers (docs/runbooks/lock-pairing.md puts it
// in Chrome and Edge on the demo laptop): a Lock that is not paired must not shut the paired one out.
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import {
  type AppToLock,
  encodeLockMessage,
  type LockStatus,
  type LockToApp,
  parseAppToLock,
  uuidv7,
} from "@uki/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createLockRelay, createMemoryPairingStore, type LockRelay } from "./lock-relay.ts";

const ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };
const CHROME = uuidv7();

const relays: LockRelay[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(relays.splice(0).map((relay) => relay.close()));
});

async function freePort(): Promise<number> {
  const server = await new Promise<NetServer>((resolve) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

/** A relay that remembers Chrome's Lock as the paired install. */
async function relayPairedWithChrome() {
  const store = createMemoryPairingStore({ install_id: CHROME, paired_at: "2026-10-07T08:00:00.000Z" });
  const statuses: LockStatus[] = [];
  const relay = createLockRelay({
    allowedOrigin: ORIGIN,
    appInfo: { app_version: "0.1.0", os: "windows" },
    onMessage: () => {},
    onStatus: (status) => statuses.push(status),
    store,
    ports: [await freePort()],
    log: quiet,
  });
  relays.push(relay);
  const port = await relay.ready;
  if (port === null) throw new Error("the relay did not bind");
  return { relay, port, statuses };
}

interface Lock {
  socket: WebSocket;
  inbox: AppToLock[];
  closed: Promise<void>;
  hello(installId: string, browser?: string): void;
}

function connect(port: number): Promise<Lock> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ORIGIN });
    sockets.push(socket);
    const inbox: AppToLock[] = [];
    const closed = new Promise<void>((done) => socket.on("close", () => done()));
    socket.on("message", (data) => {
      const parsed = parseAppToLock(String(data));
      if (parsed.ok) inbox.push(parsed.message);
    });
    socket.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    socket.on("error", reject);
    socket.on("open", () =>
      resolve({
        socket,
        inbox,
        closed,
        hello: (installId, browser = "chrome") => {
          const message: LockToApp = { type: "hello", lock_version: "0.1.0", browser, install_id: installId };
          socket.send(encodeLockMessage(message));
        },
      }),
    );
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const helloOf = (lock: Lock) => lock.inbox.find((m) => m.type === "hello");

describe("the relay's one slot", () => {
  it("gives the slot to the paired install when a Lock that is not paired woke first", async () => {
    const { relay, port, statuses } = await relayPairedWithChrome();
    const edge = await connect(port);
    edge.hello(uuidv7(), "edge");
    await waitFor(() => helloOf(edge) !== undefined);
    expect(relay.status()).toBe("connected");

    const chrome = await connect(port);
    chrome.hello(CHROME);
    await waitFor(() => helloOf(chrome) !== undefined);
    expect(helloOf(chrome)).toMatchObject({ paired: true });
    await edge.closed;
    expect(relay.status()).toBe("paired");
    expect(statuses).toEqual(["connected", "paired"]);

    relay.send({ type: "lock.start" });
    await waitFor(() => chrome.inbox.some((m) => m.type === "lock.start"));
  });

  it("keeps the slot with the first Lock when the second is not paired either", async () => {
    const { relay, port } = await relayPairedWithChrome();
    const edge = await connect(port);
    edge.hello(uuidv7(), "edge");
    await waitFor(() => helloOf(edge) !== undefined);
    const other = await connect(port);
    other.hello(uuidv7());
    await other.closed;
    expect(helloOf(other)).toBeUndefined();
    expect(edge.socket.readyState).toBe(WebSocket.OPEN);
    expect(relay.status()).toBe("connected");
  });

  it("refuses everyone else while the paired Lock has the slot", async () => {
    const { relay, port } = await relayPairedWithChrome();
    const chrome = await connect(port);
    chrome.hello(CHROME);
    await waitFor(() => relay.status() === "paired");
    await expect(connect(port)).rejects.toThrow("HTTP 409");
    expect(chrome.socket.readyState).toBe(WebSocket.OPEN);
  });
});

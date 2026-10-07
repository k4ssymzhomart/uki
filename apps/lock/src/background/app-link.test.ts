import type { AppToLock } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppLinkOptions, createAppLink } from "./app-link.ts";
import { FakeSocket } from "./testing.ts";

const APP_HELLO: AppToLock = {
  type: "hello",
  app_version: "0.1.0",
  os: "macos",
  paired: false,
  student_name: null,
};

function setup(overrides: Partial<AppLinkOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const received: AppToLock[] = [];
  const events: string[] = [];
  const keepAlive = vi.fn();
  const link = createAppLink({
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onOpen: () => {
      events.push("open");
      link.send({
        type: "hello",
        lock_version: "0.0.0",
        browser: "chrome",
        install_id: "0192f3a0-0000-7000-8000-000000000009",
      });
    },
    onMessage: (message) => received.push(message),
    onClose: () => events.push("close"),
    keepAlive,
    ...overrides,
  });
  return {
    link,
    sockets,
    received,
    events,
    keepAlive,
    last: () => sockets[sockets.length - 1] as FakeSocket,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createAppLink", () => {
  it("tries 47801, 47802 and 47803 in order and stays on the first that answers", () => {
    const { link, sockets, received, events, last } = setup();
    link.start();
    expect(last().url).toBe("ws://127.0.0.1:47801");
    last().refuse();
    expect(last().url).toBe("ws://127.0.0.1:47802");
    last().open();
    expect(events).toEqual(["open"]);
    expect(last().ofType("hello")).toHaveLength(1);
    last().receive(APP_HELLO);
    expect(received).toEqual([APP_HELLO]);
    expect(link.isOpen()).toBe(true);
    expect(sockets).toHaveLength(2);
  });

  it("tries again every 2 s while no port answers, keeping the worker alive", () => {
    const { link, sockets, keepAlive, last } = setup();
    link.start();
    for (let i = 0; i < 3; i += 1) last().refuse();
    expect(sockets).toHaveLength(3);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(4);
    expect(last().url).toBe("ws://127.0.0.1:47801");
  });

  it("pings every 5 s, answers the app's pings, and drops the link after three missed answers", () => {
    const { link, events, last, sockets } = setup();
    link.start();
    const socket = last();
    socket.autoPong = false;
    socket.open();
    socket.receive(APP_HELLO);
    socket.receive({ type: "ping", at: 1 });
    expect(socket.ofType("pong")).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(socket.ofType("ping")).toHaveLength(1);
    socket.receive({ type: "pong" });
    vi.advanceTimersByTime(15_000);
    expect(socket.ofType("ping")).toHaveLength(4);
    expect(events).toEqual(["open"]);
    vi.advanceTimersByTime(5000);
    expect(events).toEqual(["open", "close"]);
    expect(socket.readyState).toBe(3);
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
    expect(last().url).toBe("ws://127.0.0.1:47801");
  });

  it("moves on when a port answers but never says hello like the app", () => {
    const { link, events, last } = setup();
    link.start();
    last().open();
    vi.advanceTimersByTime(5000);
    expect(last().url).toBe("ws://127.0.0.1:47802");
    expect(events).toEqual(["open"]);
  });

  it("reconnects 2 s after the app goes away", () => {
    const { link, events, last, sockets } = setup();
    link.start();
    last().open();
    last().receive(APP_HELLO);
    last().close();
    expect(events).toEqual(["open", "close"]);
    expect(link.isOpen()).toBe(false);
    expect(link.send({ type: "pair.request" })).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
  });

  it("ignores frames that fail the schema", () => {
    const { link, received, last } = setup();
    link.start();
    last().open();
    last().onmessage?.({ data: "{not json" });
    last().onmessage?.({ data: JSON.stringify({ type: "lock.release", reason: "nope" }) });
    expect(received).toEqual([]);
  });

  it("stops cleanly", () => {
    const { link, events, last, sockets } = setup();
    link.start();
    last().open();
    last().receive(APP_HELLO);
    link.stop();
    expect(events).toEqual(["open", "close"]);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
  });
});

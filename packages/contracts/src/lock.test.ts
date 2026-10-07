import { describe, expect, it } from "vitest";
import { EXAM_ID, SESSION_ID, T0 } from "../test/fixtures.ts";
import { ClientEventEnvelope } from "./events.ts";
import { uuidv7 } from "./ids.ts";
import {
  type AppToLock,
  encodeLockMessage,
  isAllowedLockOrigin,
  LOCK_DISCONNECT_GRACE_MS,
  LOCK_EVENT_TYPES,
  LOCK_PORTS,
  type LockEvent,
  type LockToApp,
  lockEventToEnvelope,
  MISSED_PINGS_DOWN,
  PAIR_CODE,
  PAIR_CODE_TTL_MS,
  PING_INTERVAL_MS,
  parseAppToLock,
  parseLockMessage,
  parseLockToApp,
  RELEASE_REASONS,
} from "./lock.ts";

const at = new Date(T0).toISOString();

const lockToApp: LockToApp[] = [
  { type: "hello", lock_version: "0.1.0", browser: "chrome", install_id: uuidv7() },
  { type: "pair.request" },
  { type: "pair.confirm", code: "048213" },
  { type: "lock.started", tabs_closed: 3 },
  { type: "lock.released", tabs_restored: 3 },
  { type: "lock.released", tabs_restored: 0, trigger: "deadline" },
  { type: "lock.event", event: { id: uuidv7(), at, type: "tab.blocked", data: { host: "wikipedia.org" } } },
  { type: "lock.event", event: { id: uuidv7(), at, type: "tab.blocked", data: { host: null } } },
  { type: "lock.event", event: { id: uuidv7(), at, type: "site.closed", data: { host: "wikipedia.org" } } },
  { type: "lock.event", event: { id: uuidv7(), at, type: "copy.blocked", data: { kind: "print" } } },
  { type: "lock.event", event: { id: uuidv7(), at, type: "lock.fullscreen_exit", data: { count: 3 } } },
  { type: "lock.event", event: { id: uuidv7(), at, type: "exam.submitted", data: {} } },
  {
    type: "lock.event",
    session_id: SESSION_ID,
    event: { id: uuidv7(), at, type: "exam.submitted", data: {} },
  },
  { type: "ping", at: T0 },
  { type: "pong" },
];

const appToLock: AppToLock[] = [
  { type: "hello", app_version: "0.1.0", os: "windows", paired: false, student_name: "Aliya Seitkali" },
  { type: "pair.code", code: "048213", expires_at: new Date(T0 + PAIR_CODE_TTL_MS).toISOString() },
  { type: "pair.ok" },
  { type: "pair.fail", reason: "expired" },
  { type: "exam.state", phase: "idle", watch: "watching", locale: "kk", exam: null },
  {
    type: "exam.state",
    phase: "writing",
    watch: "phone_found",
    locale: "ru",
    exam: {
      session_id: SESSION_ID,
      mode: "browser",
      title: "Physics 1 · Quiz 3",
      starts_at: "2026-10-09T10:35:00+00:00",
      ends_at: "2026-10-09T11:15:00+00:00",
      allowed_hosts: ["uki-lms-mock.vercel.app", "localhost:5180"],
      lms_url: "https://uki-lms-mock.vercel.app/physics-1/quiz-3",
      done_path: "/physics-1/quiz-3/review",
    },
    clock_offset_ms: -2_400_000,
  },
  { type: "lock.start" },
  { type: "lock.release", reason: "submitted" },
  { type: "ping" },
  { type: "pong", at: T0 },
];

describe("constants", () => {
  it("matches the plan", () => {
    expect(LOCK_PORTS).toEqual([47801, 47802, 47803]);
    expect(PING_INTERVAL_MS).toBe(5000);
    expect(MISSED_PINGS_DOWN).toBe(3);
    expect(PAIR_CODE_TTL_MS).toBe(120_000);
    expect(LOCK_DISCONNECT_GRACE_MS).toBe(15_000);
    expect(PAIR_CODE.test("048213")).toBe(true);
    expect(PAIR_CODE.test("48213")).toBe(false);
    expect(PAIR_CODE.test("0482134")).toBe(false);
    expect(RELEASE_REASONS).toEqual(["submitted", "time_up", "ended"]);
    expect(LOCK_EVENT_TYPES).toEqual([
      "tab.blocked",
      "site.closed",
      "copy.blocked",
      "lock.fullscreen_exit",
      "exam.submitted",
    ]);
  });
});

describe("messages", () => {
  it.each(lockToApp)("round-trips Lock -> app %o", (message) => {
    expect(parseLockToApp(encodeLockMessage(message))).toEqual({ ok: true, message });
    expect(parseLockMessage(encodeLockMessage(message), "lock").ok).toBe(true);
  });

  it.each(appToLock)("round-trips app -> Lock %o", (message) => {
    expect(parseAppToLock(encodeLockMessage(message))).toEqual({ ok: true, message });
    expect(parseLockMessage(encodeLockMessage(message), "app").ok).toBe(true);
  });

  it("keeps the two hellos apart", () => {
    const appHello = encodeLockMessage(appToLock[0] as AppToLock);
    expect(parseLockToApp(appHello).ok).toBe(false);
  });

  it("refuses bad frames", () => {
    expect(parseLockToApp("{")).toEqual({ ok: false, error: "not JSON" });
    expect(parseLockToApp(JSON.stringify({ type: "lock.start" })).ok).toBe(false);
    expect(parseLockToApp(JSON.stringify({ type: "pair.confirm", code: "12345a" })).ok).toBe(false);
    expect(
      parseLockToApp(
        JSON.stringify({
          type: "lock.event",
          event: { id: uuidv7(), at, type: "site.closed", data: { host: "https://wikipedia.org/wiki/Abai" } },
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseLockToApp(
        JSON.stringify({ type: "lock.event", event: { id: uuidv7(), at, type: "phone.detected", data: {} } }),
      ).ok,
    ).toBe(false);
    expect(parseAppToLock(JSON.stringify({ type: "lock.release", reason: "bored" })).ok).toBe(false);
    expect(
      parseLockToApp(JSON.stringify({ type: "lock.released", tabs_restored: 0, trigger: "bored" })).ok,
    ).toBe(false);
    const state = { type: "exam.state", phase: "idle", watch: "watching", locale: "kk", exam: null };
    expect(parseAppToLock(JSON.stringify({ ...state, clock_offset_ms: 1.5 })).ok).toBe(false);
    expect(parseAppToLock("x".repeat(70_000))).toEqual({ ok: false, error: "message too large" });
  });
});

describe("origin check", () => {
  it("accepts only the Lock's extension origin", () => {
    const id = "abcdefghijklmnopabcdefghijklmnop";
    expect(isAllowedLockOrigin(`chrome-extension://${id}`, id)).toBe(true);
    expect(isAllowedLockOrigin("https://evil.example", id)).toBe(false);
    expect(isAllowedLockOrigin(`chrome-extension://${id}x`, id)).toBe(false);
    expect(isAllowedLockOrigin(undefined, id)).toBe(false);
    expect(isAllowedLockOrigin("chrome-extension://", "")).toBe(false);
  });
});

describe("lockEventToEnvelope", () => {
  const ctx = { session_id: SESSION_ID, seq: 12, app_version: "0.1.0" };

  it("keeps the Lock's id and data, with source lock", () => {
    const event: LockEvent = { id: uuidv7(), at, type: "copy.blocked", data: { kind: "copy" } };
    const envelope = lockEventToEnvelope(event, ctx);
    expect(envelope).toMatchObject({ id: event.id, source: "lock", type: "copy.blocked", seq: 12 });
    expect(ClientEventEnvelope.safeParse(envelope).success).toBe(true);
  });

  it("needs time_used_s for exam.submitted", () => {
    const event: LockEvent = { id: uuidv7(), at, type: "exam.submitted", data: {} };
    expect(() => lockEventToEnvelope(event, ctx)).toThrow();
    const envelope = lockEventToEnvelope(event, { ...ctx, time_used_s: 2100 });
    expect(envelope.data).toEqual({ time_used_s: 2100 });
    expect(ClientEventEnvelope.safeParse(envelope).success).toBe(true);
  });

  it("gives every Lock event an envelope ingest accepts", () => {
    for (const message of lockToApp) {
      if (message.type !== "lock.event") continue;
      const envelope = lockEventToEnvelope(message.event, { ...ctx, time_used_s: 60 });
      expect(ClientEventEnvelope.safeParse(envelope).success, message.event.type).toBe(true);
    }
    expect(EXAM_ID).toBeTruthy();
  });
});

import { type CommandMessage, uuidv7 } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outbox } from "../outbox/outbox.ts";
import { FakeBridge, FakeDetection, FakeIdentity, FakeStudentApi } from "../test/fakes.ts";
import { joinOutput } from "../test/flow-fixtures.ts";
import { advance, EXAM_ID, freshOutbox, QUESTION_IDS, SESSION_ID, useFakeClock } from "../test/harness.ts";
import { stageOf } from "./derive.ts";
import { FlowRuntime, META_JOIN } from "./runtime.ts";
import { selectScreen } from "./select.ts";

// IndexedDB work runs on real macrotasks between fake-clock steps; a loaded CI machine needs time.
vi.setConfig({ testTimeout: 30_000 });

let bridge: FakeBridge;
let api: FakeStudentApi;
let outbox: Outbox;
let detection: FakeDetection | null;
let runtime: FlowRuntime;

function makeRuntime(): FlowRuntime {
  return new FlowRuntime({
    bridge,
    api,
    ensureSignedIn: async () => {},
    outbox,
    locale: "kk",
    contactEmail: null,
    createDetection: (options) => {
      detection = new FakeDetection(options);
      return detection;
    },
    createIdentity: (options) => new FakeIdentity(options),
  });
}

function command(type: CommandMessage["type"], payload: object): CommandMessage {
  return {
    id: uuidv7(),
    session_id: SESSION_ID,
    exam_id: EXAM_ID,
    issued_at: new Date().toISOString(),
    by_name: "Aigerim Sadykova",
    type,
    payload,
  } as CommandMessage;
}

function screen() {
  return selectScreen(runtime.actor.getSnapshot());
}

function stage() {
  return stageOf(runtime.actor.getSnapshot());
}

beforeEach(() => {
  useFakeClock();
  bridge = new FakeBridge();
  api = new FakeStudentApi({ examId: EXAM_ID, now: () => Date.now() });
  outbox = freshOutbox();
  detection = null;
});

afterEach(async () => {
  runtime.stop();
  await outbox.db.delete();
  vi.useRealTimers();
});

async function joinAndCheckIn(): Promise<void> {
  runtime.start();
  await advance(500);
  runtime.send({ type: "JOIN", code: "math2-204-fri", studentNumber: "20231187" });
  await advance(1000);
  expect(stage()).toBe("system");
  // The Lock learns the student's name for its popup right after the join.
  expect(bridge.lockSent).toContainEqual(
    expect.objectContaining({ type: "hello", student_name: "Madina Tulegenova" }),
  );
  expect(screen()).toMatchObject({ frame: "1.2", canContinue: true, version: { version: "1.4.2" } });
  runtime.send({ type: "CONTINUE" });
  await advance(500);
  expect(screen()).toMatchObject({ frame: "1.3", canContinue: true });
  runtime.send({ type: "CONTINUE" });
  await advance(2500);
  expect(stage()).toBe("rules");
}

describe("the flow runtime", () => {
  it("runs join to receipt: check-in status, exam, answers, Lock, commands, stills, submit, clear", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() + 2 * 60_000 });
    runtime = makeRuntime();
    await joinAndCheckIn();
    expect(await outbox.getMeta(META_JOIN, (v) => v)).toEqual({
      code: "MATH2-204-FRI",
      studentNumber: "20231187",
      locale: "kk",
    });
    expect(detection?.phases).toContain("check");
    const steps = api.statuses.map((status) => (status as { step?: string }).step);
    expect(steps).toEqual(expect.arrayContaining(["checking", "identity", "rules"]));
    runtime.send({ type: "SET_AGREED", agreed: true });
    await advance(2500);
    expect(api.statuses.at(-1)).toEqual({ step: "ready" });
    expect(bridge.lockSent.at(-1)).toMatchObject({ type: "exam.state", phase: "lobby" });

    // The start time comes: 2.1 opens, lockdown on, the browser locked, the questions loaded.
    await advance(2 * 60_000, 1000);
    expect(stage()).toBe("writing");
    expect(bridge.last("lockdown")).toBe(true);
    expect(bridge.lockSent.some((m) => m.type === "lock.start")).toBe(true);
    expect(detection?.phases.at(-1)).toBe("exam");
    bridge.fromLock({ type: "lock.started", tabs_closed: 3 });
    await advance(2500);
    expect(screen()).toMatchObject({
      frame: "2.1",
      question: { n: 1, total: 20 },
      browserLocked: { tabsClosed: 3 },
    });
    expect(api.ofType("exam.started")).toHaveLength(1);
    expect(api.ofType("identity.matched")[0]?.data).toEqual({ score: 0.82, tries: 1 });

    // An answer is saved and synced; the status names the question.
    runtime.send({ type: "SELECT_CHOICE", questionId: QUESTION_IDS[0] ?? "", choiceId: "a" });
    runtime.send({ type: "NEXT_QUESTION" });
    await advance(2500);
    expect(api.answers.get(`${SESSION_ID}/${QUESTION_IDS[0]}`)?.choice_id).toBe("a");
    expect(api.ofType("answer.saved")).toHaveLength(1);
    expect(api.statuses.at(-1)).toEqual({ question: 2 });

    // Focus leaves the locked window twice in a row: one tab.blocked. The Lock reports a copy.
    bridge.blur();
    bridge.blur();
    bridge.fromLock({
      type: "lock.event",
      event: { id: uuidv7(), at: new Date().toISOString(), type: "copy.blocked", data: { kind: "copy" } },
    });
    await advance(2500);
    expect(api.ofType("tab.blocked").map((e) => e.data)).toEqual([{ app: null }]);
    expect(api.ofType("copy.blocked")[0]?.source).toBe("lock");

    // A proctor pause applies once, is acked, and stops detection; resume closes 2.1c.
    const pause = command("pause", { text: "Stay in your seat." });
    api.broadcast(pause);
    api.broadcast(pause);
    await advance(1000);
    expect(screen()).toMatchObject({ frame: "2.1c", proctorPause: { text: "Stay in your seat." } });
    expect(api.acked.has(pause.id)).toBe(true);
    expect(detection?.phases.at(-1)).toBe("idle");
    api.broadcast(command("resume", {}));
    await advance(1000);
    expect(screen().frame).toBe("2.1");

    // A phone: the event flushes at once, its three stills upload and are confirmed.
    const phoneId = uuidv7();
    detection?.handlers.onEvent?.({
      id: phoneId,
      type: "phone.detected",
      at: Date.now(),
      data: { score: 0.94, held_ms: 400 },
      frame_count: 3,
    });
    detection?.handlers.onCue?.({ kind: "cue", cue: "phone", on: true, score: 0.94 });
    for (let index = 0; index < 3; index += 1) {
      detection?.handlers.onStill?.({
        eventId: phoneId,
        index,
        at: Date.now() + index * 1000,
        blob: new Blob([new Uint8Array([0xff, 0xd8, index])], { type: "image/jpeg" }),
      });
    }
    await advance(500);
    expect(screen()).toMatchObject({ frame: "2.2", phone: { score: 0.94 } });
    expect(bridge.lockSent.at(-1)).toMatchObject({ type: "exam.state", watch: "phone_found" });
    await advance(3000);
    expect(api.ofType("phone.detected")).toHaveLength(1);
    expect(api.frames.size).toBe(3);

    // Submit: receipt, the Lock released, lockdown off, detection off, the outbox cleared once empty.
    runtime.send({ type: "SUBMIT" });
    await advance(3000);
    // Two flags: the lost focus (tab.blocked) and the phone.
    expect(screen()).toMatchObject({ frame: "3.1", receiptId: "UKI-204-0917-MT", flags: 2 });
    expect(bridge.lockSent.some((m) => m.type === "lock.release" && m.reason === "submitted")).toBe(true);
    expect(bridge.last("lockdown")).toBe(false);
    expect(detection?.phases.at(-1)).toBe("off");
    await advance(6000, 1000);
    expect(await outbox.getMeta(META_JOIN, (v) => v)).toBeNull();
    expect(await outbox.isEmpty(SESSION_ID)).toBe(true);
    const seqs = [...api.events.values()].map((e) => e.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(seqs.map((_, i) => i));
  });

  it("rejoins after a restart and comes back to the exam without a second exam.started", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() - 10 * 60_000, state: "writing" });
    await outbox.setMeta(META_JOIN, { code: "MATH2-204-FRI", studentNumber: "20231187", locale: "ru" });
    await outbox.saveAnswer(
      SESSION_ID,
      QUESTION_IDS[0] ?? "",
      "b",
      new Date(Date.now() - 60_000).toISOString(),
    );
    runtime = makeRuntime();
    runtime.start();
    await advance(3000);
    expect(stage()).toBe("writing");
    expect(screen()).toMatchObject({
      frame: "2.1",
      locale: "ru",
      question: { body: "Вопрос 1", selectedChoiceId: "b" },
      answeredCount: 1,
    });
    expect(bridge.last("lockdown")).toBe(true);
    expect(api.ofType("exam.started")).toHaveLength(0);
  });

  it("shows 2.1a during a cut and sends net.offline after it", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() - 60_000, state: "writing" });
    await outbox.setMeta(META_JOIN, { code: "MATH2-204-FRI", studentNumber: "20231187", locale: "kk" });
    runtime = makeRuntime();
    runtime.start();
    await advance(3000);
    api.online = false;
    runtime.send({ type: "SELECT_CHOICE", questionId: QUESTION_IDS[0] ?? "", choiceId: "c" });
    await advance(30_000, 500);
    expect(screen()).toMatchObject({ frame: "2.1a", savedOffline: true });
    api.online = true;
    await advance(35_000, 1000);
    expect(screen().frame).toBe("2.1");
    expect(api.ofType("net.offline")).toHaveLength(1);
    expect(api.answers.get(`${SESSION_ID}/${QUESTION_IDS[0]}`)?.choice_id).toBe("c");
  });

  it("browser exams: hides the window, sends exam.started on lock.started, submits on the Lock's exam.submitted", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() + 60_000, mode: "browser" });
    runtime = makeRuntime();
    await joinAndCheckIn();
    runtime.send({ type: "SET_AGREED", agreed: true });
    await advance(61_000, 1000);
    expect(stage()).toBe("waitingLock");
    expect(bridge.last("hideToTray")).toBe(true);
    expect(bridge.calls.some(([name]) => name === "lockdown")).toBe(false);
    expect(bridge.lockSent.at(-1)).toMatchObject({
      type: "exam.state",
      phase: "ready",
      exam: { allowed_hosts: ["localhost:5180"] },
    });
    bridge.fromLock({ type: "lock.started", tabs_closed: 2 });
    await advance(2500);
    expect(api.ofType("exam.started")).toHaveLength(1);
    expect(detection?.phases.at(-1)).toBe("exam");
    api.broadcast(command("message", { preset: "message.preset.phones_away", scope: "group" }));
    await advance(500);
    expect(bridge.last("hideToTray")).toBe(false);
    runtime.send({ type: "ACK_NOTICE" });
    await advance(500);
    expect(bridge.last("hideToTray")).toBe(true);
    bridge.fromLock({
      type: "lock.event",
      event: { id: uuidv7(), at: new Date().toISOString(), type: "exam.submitted", data: {} },
    });
    await advance(3000);
    expect(screen().frame).toBe("3.1");
    expect(bridge.last("hideToTray")).toBe(false);
    expect(bridge.lockSent.some((m) => m.type === "lock.release")).toBe(true);
    expect(api.ofType("exam.submitted")).toHaveLength(0);
  });
});

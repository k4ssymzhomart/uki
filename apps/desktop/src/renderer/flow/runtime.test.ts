import { type CommandMessage, type SessionCommandRow, uuidv7 } from "@uki/contracts";
import type { RulesState } from "@uki/detection";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outbox } from "../outbox/outbox.ts";
import { ServiceError } from "../services/errors.ts";
import { JoinFailure } from "../services/student-api.ts";
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

/** The same command as a session_commands row (the catch-up read). */
function commandRow(message: CommandMessage): SessionCommandRow {
  return {
    ...message,
    issued_by: "d0000000-0000-4000-8000-000000000002",
    acked_at: null,
  } as SessionCommandRow;
}

/** The worker's rules state with one face in view, paused or not. */
function rulesState(paused: boolean): RulesState {
  return {
    mode: "app",
    at: Date.now(),
    faces: 1,
    gaze: "on",
    look: null,
    noFaceMs: null,
    twoFacesMs: null,
    phone: { hits: 0, warning: false },
    paused: paused ? { reason: "face_missing", since: Date.now() - 20_000 } : null,
    cameraLost: false,
    canResume: paused,
  };
}

async function restoredExam(state: "writing" | "paused", startsAgoMs = 10 * 60_000): Promise<void> {
  api.joinOutput = joinOutput({ startsAt: Date.now() - startsAgoMs, state });
  await outbox.setMeta(META_JOIN, { code: "MATH2-204-FRI", studentNumber: "20231187", locale: "kk" });
  runtime = makeRuntime();
  runtime.start();
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
    expect(api.statuses.at(-1)).toEqual({ step: "ready", rules_locale: "kk" });
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

  it("applies a command whose broadcast was lost from the ingest heartbeat, once", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() - 10 * 60_000, state: "writing" });
    await outbox.setMeta(META_JOIN, { code: "MATH2-204-FRI", studentNumber: "20231187", locale: "kk" });
    // The server lists the pause until it is acked; its broadcast never arrives.
    const pause = command("pause", { text: "Stay in your seat." });
    let replies = 0;
    const ingest = api.ingest.bind(api);
    api.ingest = async (request) => {
      const reply = await ingest(request);
      replies += 1;
      return replies > 1 && !api.acked.has(pause.id) ? { ...reply, pending_commands: [pause] } : reply;
    };
    runtime = makeRuntime();
    runtime.start();
    await advance(3000);
    expect(stage()).toBe("writing");
    await advance(11_000, 1000);
    expect(screen()).toMatchObject({
      frame: "2.1c",
      proctorPause: { text: "Stay in your seat.", proctorName: "Aigerim Sadykova" },
    });
    expect(api.acked.has(pause.id)).toBe(true);
    // A late broadcast of the same command changes nothing.
    api.broadcast(pause);
    await advance(1000);
    expect((await outbox.commands(SESSION_ID)).filter((row) => row.id === pause.id)).toHaveLength(1);
    api.broadcast(command("resume", {}));
    await advance(1000);
    expect(screen().frame).toBe("2.1");
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

  it("app exams (C2): 1.2 asks to close another browser, and one started mid-exam sends tab.blocked", async () => {
    const chrome = { id: "chrome", name: "Google Chrome", kind: "browser" } as const;
    api.joinOutput = joinOutput({ startsAt: Date.now() + 60_000 });
    bridge.scanResult = { apps: [chrome], screenShare: [], freeMb: 50_000 };
    runtime = makeRuntime();
    runtime.start();
    await advance(500);
    runtime.send({ type: "JOIN", code: "math2-204-fri", studentNumber: "20231187" });
    await advance(1000);
    expect(stage()).toBe("system");
    expect(bridge.scanOptions).toEqual([{ browsers: true }]);
    // The Other apps row names it with check.apps.fail, as it names Telegram; the lobby sees it too.
    expect(screen()).toMatchObject({
      frame: "1.2",
      apps: { status: "fail", app: "Google Chrome" },
      canContinue: false,
    });
    expect(api.statuses.at(-1)).toEqual({ step: "checking", detail: "app:Google Chrome" });

    // The student closes it and presses Check again.
    bridge.scanResult = { apps: [], screenShare: [], freeMb: 50_000 };
    runtime.send({ type: "CHECK_AGAIN" });
    await advance(1000);
    expect(bridge.scanOptions).toEqual([{ browsers: true }, { browsers: true }]);
    expect(screen()).toMatchObject({ frame: "1.2", apps: { status: "ready", app: null }, canContinue: true });

    runtime.send({ type: "CONTINUE" });
    await advance(500);
    runtime.send({ type: "CONTINUE" });
    await advance(2500);
    runtime.send({ type: "SET_AGREED", agreed: true });
    await advance(61_000, 1000);
    expect(stage()).toBe("writing");
    expect(bridge.watching).toBe(true);
    expect(bridge.watchOptions).toEqual([{ browsers: true }]);

    // The exam-time scan finds Chrome started: tab.blocked with its name.
    bridge.blocked([chrome]);
    await advance(2500);
    expect(api.ofType("tab.blocked").map((e) => e.data)).toEqual([{ app: "Google Chrome" }]);
  });

  it("browser exams (C2): the browser the exam needs never fails 1.2 and is never reported", async () => {
    const chrome = { id: "chrome", name: "Google Chrome", kind: "browser" } as const;
    const telegram = { id: "telegram", name: "Telegram", kind: "app" } as const;
    api.joinOutput = joinOutput({ startsAt: Date.now() + 60_000, mode: "browser" });
    bridge.scanResult = { apps: [chrome], screenShare: [], freeMb: 50_000 };
    runtime = makeRuntime();
    await joinAndCheckIn();
    expect(bridge.scanOptions).toEqual([{ browsers: false }]);
    runtime.send({ type: "SET_AGREED", agreed: true });
    await advance(61_000, 1000);
    bridge.fromLock({ type: "lock.started", tabs_closed: 2 });
    await advance(2500);
    expect(bridge.watchOptions).toEqual([{ browsers: false }]);
    bridge.blocked([chrome]);
    bridge.blocked([chrome, telegram]);
    await advance(2500);
    expect(api.ofType("tab.blocked").map((e) => e.data)).toEqual([{ app: "Telegram" }]);
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
  it("browser exams: Üki Lock sees lobby until the box is ticked, and a lock.started that came first starts the exam", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() + 60_000, mode: "browser" });
    runtime = makeRuntime();
    await joinAndCheckIn();
    // The start time passes on 1.4 with the box not ticked.
    await advance(61_000, 1000);
    expect(stage()).toBe("rules");
    expect(bridge.lockSent.filter((m) => m.type === "exam.state").at(-1)).toMatchObject({ phase: "lobby" });
    bridge.fromLock({ type: "lock.started", tabs_closed: 2 });
    await advance(500);
    runtime.send({ type: "SET_AGREED", agreed: true });
    await advance(2500);
    expect(stage()).toBe("writing");
    expect(api.ofType("exam.started")).toHaveLength(1);
    expect(detection?.phases.at(-1)).toBe("exam");
    expect(bridge.last("hideToTray")).toBe(true);
  });

  it("browser exams: the process scan runs from lock.started until 3.1, also while 2.1e shows", async () => {
    api.joinOutput = joinOutput({ startsAt: Date.now() + 60_000, mode: "browser" });
    runtime = makeRuntime();
    await joinAndCheckIn();
    runtime.send({ type: "SET_AGREED", agreed: true });
    await advance(61_000, 1000);
    expect(stage()).toBe("waitingLock");
    expect(bridge.watching).toBe(false);
    bridge.fromLock({ type: "lock.started", tabs_closed: 2 });
    await advance(2500);
    expect(bridge.watching).toBe(true);
    bridge.blocked([{ id: "anydesk", name: "AnyDesk", kind: "screen_share" }]);
    await advance(2500);
    expect(api.ofType("tab.blocked").map((e) => e.data)).toEqual([{ app: "AnyDesk" }]);
    // Focus leaving Üki's window means nothing in a browser exam.
    bridge.blur();
    await advance(2500);
    expect(api.ofType("tab.blocked")).toHaveLength(1);
    // 2.1e brings the window out of the tray; the scan, and with it the hold on quit, stays on.
    api.broadcast(command("message", { preset: "message.preset.phones_away", scope: "group" }));
    await advance(500);
    expect(bridge.last("hideToTray")).toBe(false);
    expect(bridge.watching).toBe(true);
    bridge.fromLock({
      type: "lock.event",
      event: { id: uuidv7(), at: new Date().toISOString(), type: "exam.submitted", data: {} },
    });
    await advance(3000);
    expect(screen().frame).toBe("3.1");
    expect(bridge.watching).toBe(false);
  });

  it("restarts into the proctor's pause (2.1c) the server still lists, and sends no session.resumed", async () => {
    // The proctor paused while the app was down: no row on this laptop, an unacked one on the server.
    const pause = command("pause", { text: "Stay in your seat." });
    api.commandRows = [commandRow(pause)];
    // The channel joins late and the read is slow, as on a real network; the catch-up read decides.
    const subscribe = api.subscribeCommands.bind(api);
    api.subscribeCommands = (sessionId, handlers) =>
      subscribe(sessionId, {
        onCommand: handlers.onCommand,
        onStatus: (status) => setTimeout(() => handlers.onStatus(status), 300),
      });
    const unacked = api.unackedCommands.bind(api);
    api.unackedCommands = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return unacked();
    };
    await restoredExam("paused");
    await advance(1500);
    // A face in view and I'm here before the list arrives: no 2.3 to end, nothing sent.
    if (detection) detection.resumeResult = false;
    detection?.handlers.onState?.(rulesState(false));
    runtime.send({ type: "IM_HERE" });
    await advance(3000);
    expect(stage()).toBe("proctorPaused");
    expect(screen()).toMatchObject({ frame: "2.1c", proctorPause: { text: "Stay in your seat." } });
    expect(api.acked.has(pause.id)).toBe(true);
    // I'm here on 2.1c: the proctor's pause stays.
    runtime.send({ type: "IM_HERE" });
    await advance(3000);
    expect(stage()).toBe("proctorPaused");
    expect(api.ofType("session.resumed")).toHaveLength(0);
    api.broadcast(command("resume", {}));
    await advance(1000);
    expect(screen().frame).toBe("2.1");
    expect(api.ofType("session.resumed")).toHaveLength(0);
  });

  it("restarts into 2.3 when the server lists no pause command, and I'm here resumes", async () => {
    await restoredExam("paused");
    await advance(3000);
    expect(screen().frame).toBe("2.3");
    if (detection) detection.resumeResult = false;
    detection?.handlers.onState?.(rulesState(false));
    runtime.send({ type: "IM_HERE" });
    await advance(3000);
    expect(screen().frame).toBe("2.1");
    expect(api.ofType("session.resumed").map((e) => e.data.by)).toEqual(["student"]);
  });

  it("a proctor's pause during 2.3 opens 2.1c; I'm here cannot end it, and the worker resumes after it", async () => {
    await restoredExam("writing");
    await advance(3000);
    // No face: the worker pauses and sends session.paused (offline, the server has not seen it).
    detection?.handlers.onState?.(rulesState(true));
    detection?.handlers.onCue?.({ kind: "cue", cue: "paused", on: true, reason: "face_missing" });
    await advance(500);
    expect(screen().frame).toBe("2.3");
    const resume = vi.spyOn(detection as FakeDetection, "resume");
    api.broadcast(command("pause", { text: "Stay in your seat." }));
    await advance(1000);
    expect(screen()).toMatchObject({ frame: "2.1c", proctorPause: { text: "Stay in your seat." } });
    runtime.send({ type: "IM_HERE" });
    await advance(1000);
    expect(resume).not.toHaveBeenCalled();
    expect(stage()).toBe("proctorPaused");
    // After the proctor's resume the worker, still paused, resumes with a face in view.
    api.broadcast(command("resume", {}));
    await advance(1000);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(screen().frame).toBe("2.1");
    expect(detection?.phases.at(-1)).toBe("exam");
  });

  it("counts a Lock event once when the Lock sends its outbox again on a new link", async () => {
    await restoredExam("writing");
    await advance(3000);
    const blocked = {
      id: uuidv7(),
      at: new Date().toISOString(),
      type: "tab.blocked" as const,
      data: { host: "chat.example.com" },
    };
    bridge.fromLock({ type: "lock.event", event: blocked });
    await advance(2500);
    expect(api.ofType("tab.blocked")).toHaveLength(1);
    // The link drops and comes back: the Lock says hello and sends the same event again.
    bridge.fromLock({
      type: "hello",
      lock_version: "1.0.0",
      browser: "Chrome",
      install_id: "0199a000-0000-7000-8000-0000000000f1",
    });
    bridge.fromLock({ type: "lock.event", event: blocked });
    await advance(2500);
    runtime.send({ type: "SUBMIT" });
    await advance(3000);
    expect(screen()).toMatchObject({ frame: "3.1", flags: 1 });
    expect(api.ofType("tab.blocked")).toHaveLength(1);
    const seqs = [...api.events.values()].map((e) => e.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(seqs.map((_, i) => i));
  });

  it("queues the Lock's Ask proctor (E.5a) as its own event and answers help.queued, also on a resend", async () => {
    await restoredExam("writing");
    await advance(3000);
    const ask = {
      id: uuidv7(),
      at: new Date().toISOString(),
      type: "student.help_requested" as const,
      data: { topic: "technical" as const, text: "The calculator tab doesn’t open." },
    };
    bridge.fromLock({ type: "lock.event", event: ask });
    await advance(2500);
    expect(api.ofType("student.help_requested")).toHaveLength(1);
    expect(api.ofType("student.help_requested")[0]).toMatchObject({ source: "lock", data: ask.data });
    expect(bridge.lockSent.filter((m) => m.type === "help.queued")).toEqual([
      { type: "help.queued", id: ask.id },
    ]);
    // The sheet did not hear back (the link dropped): the Lock sends the event again and is answered again.
    bridge.fromLock({ type: "lock.event", event: ask });
    await advance(2500);
    expect(api.ofType("student.help_requested")).toHaveLength(1);
    expect(bridge.lockSent.filter((m) => m.type === "help.queued")).toHaveLength(2);
  });

  it("queues the app's own Ask proctor from 2.1 in the outbox, through a network cut", async () => {
    await restoredExam("writing");
    await advance(3000);
    api.online = false;
    runtime.send({ type: "ASK_HELP", topic: "question", text: "Q 7: is it radians?" });
    await advance(5000);
    expect(api.ofType("student.help_requested")).toHaveLength(0);
    expect(screen()).toMatchObject({ help: { requestedAt: expect.any(Number) } });
    api.online = true;
    await advance(35_000, 1000);
    expect(api.ofType("student.help_requested")).toHaveLength(1);
    expect(api.ofType("student.help_requested")[0]).toMatchObject({
      source: "app",
      data: { topic: "question", text: "Q 7: is it radians?" },
    });
  });

  it("waits 2, 4, 8, 16, then 30 s between failed question loads, so join_exam's limit can clear", async () => {
    api.questionsAfterStart = false;
    let limited = false;
    let joins = 0;
    const joinExam = api.joinExam.bind(api);
    api.joinExam = async () => {
      joins += 1;
      if (limited) throw new JoinFailure("rate_limited");
      return joinExam();
    };
    await restoredExam("writing", 60_000);
    await advance(3000);
    expect(screen()).toMatchObject({ frame: "2.1", questionsLoading: true });
    limited = true;
    const before = joins;
    await advance(60_000, 1000);
    // Tries at about 2, 6, 14, 30 and 60 s, never a burst.
    expect(joins - before).toBeLessThanOrEqual(6);
    limited = false;
    api.questionsAfterStart = true;
    await advance(31_000, 1000);
    expect(screen()).toMatchObject({ frame: "2.1", question: { n: 1 } });
  });

  it("shows the questions error after the retries, tries every 30 s, and Check again tries at once", async () => {
    api.questionsAfterStart = false;
    let down = false;
    const joins: number[] = [];
    const joinExam = api.joinExam.bind(api);
    api.joinExam = async () => {
      joins.push(Date.now());
      if (down) throw new ServiceError("network", "HTTP 546", 546);
      return joinExam();
    };
    await restoredExam("writing", 60_000);
    await advance(3000);
    expect(screen()).toMatchObject({ frame: "2.1", questionsLoading: true, questionsFailed: false });
    down = true;
    // The first load tries at once and after 2, 4, 8 and 16 s, then gives up: the banner shows.
    await advance(28_000, 1000);
    expect(screen()).toMatchObject({
      frame: "2.1",
      question: null,
      questionsFailed: true,
      questionsLoading: false,
    });

    // Check again: one join_exam at once, then the banner again.
    let before = joins.length;
    runtime.send({ type: "RETRY_QUESTIONS" });
    await advance(500);
    expect(joins.length - before).toBe(1);
    expect(screen()).toMatchObject({ questionsFailed: true, questionsLoading: false });

    // On its own it tries once every 30 s, never a ladder again.
    before = joins.length;
    await advance(61_000, 1000);
    expect(joins.length - before).toBe(2);
    expect(screen()).toMatchObject({ questionsFailed: true });

    down = false;
    api.questionsAfterStart = true;
    runtime.send({ type: "RETRY_QUESTIONS" });
    await advance(500);
    expect(screen()).toMatchObject({ frame: "2.1", question: { n: 1 }, questionsFailed: false });
  });

  it("shows the questions error at once when join_exam refuses for good, and recovers on its own", async () => {
    api.questionsAfterStart = false;
    let refuse = false;
    const joinExam = api.joinExam.bind(api);
    api.joinExam = async () => {
      if (refuse) throw new JoinFailure("lobby_closed");
      return joinExam();
    };
    await restoredExam("writing", 60_000);
    await advance(1000);
    refuse = true;
    // The ladder's next try (2 s) is refused for good: no more ladder.
    await advance(2500);
    expect(screen()).toMatchObject({ frame: "2.1", question: null, questionsFailed: true });
    refuse = false;
    api.questionsAfterStart = true;
    await advance(31_000, 1000);
    expect(screen()).toMatchObject({ frame: "2.1", question: { n: 1 }, questionsFailed: false });
  });
});

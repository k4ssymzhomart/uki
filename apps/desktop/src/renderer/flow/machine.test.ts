import { IngestStatus } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import type { FlowCommand } from "../services/commands.ts";
import { JoinFailure } from "../services/student-api.ts";
import { joinOutput, MIN, READY_ROWS, START, settle, startFlow } from "../test/flow-fixtures.ts";
import { QUESTION_IDS, SESSION_ID } from "../test/harness.ts";
import {
  ingestStatus,
  lockExamState,
  stageOf,
  wantsDetection,
  wantsExamWatch,
  wantsHidden,
  wantsLockdown,
} from "./derive.ts";
import { selectScreen } from "./select.ts";
import type { CheckRows, FlowEffect } from "./types.ts";

type Flow = ReturnType<typeof startFlow>;

function frame(flow: Flow): string {
  return selectScreen(flow.actor.getSnapshot()).frame;
}

function events(effects: FlowEffect[]): string[] {
  return effects.flatMap((e) => (e.type === "effect.event" ? [e.eventType] : []));
}

function command(
  type: FlowCommand["type"],
  payload: object,
  issuedAt = START + 30 * MIN,
  byName: string | null = "Aigerim Sadykova",
): FlowCommand {
  return { id: crypto.randomUUID(), type, payload, issuedAt, byName } as FlowCommand;
}

async function joined(flow: Flow): Promise<void> {
  flow.actor.send({ type: "JOIN", code: "math2-204-fri ", studentNumber: "20231187" });
  await settle();
}

async function toRules(flow: Flow): Promise<void> {
  await joined(flow);
  flow.actor.send({ type: "CHECK_ROWS", rows: READY_ROWS });
  flow.actor.send({ type: "CONTINUE" });
  flow.actor.send({
    type: "IDENTITY_VERDICT",
    kind: "matched",
    tries: 1,
    rows: { face: "ok", card: "ok", person: "ok" },
    score: 0.82,
  });
  flow.actor.send({ type: "CONTINUE" });
}

async function toExam(flow: Flow): Promise<void> {
  await toRules(flow);
  flow.actor.send({ type: "SET_AGREED", agreed: true });
  flow.actor.send({ type: "TICK", now: START });
  await settle();
}

describe("1.1 Join and 1.1a Wrong code", () => {
  it("joins with the normalized code and the locale, then opens 1.2", async () => {
    const flow = startFlow();
    await settle();
    expect(frame(flow)).toBe("1.1");
    flow.actor.send({ type: "SET_LOCALE", locale: "ru" });
    await joined(flow);
    expect(flow.joins).toEqual([{ code: "MATH2-204-FRI", studentNumber: "20231187", locale: "ru" }]);
    expect(frame(flow)).toBe("1.2");
    expect(flow.effects.find((e) => e.type === "effect.joined")).toBeDefined();
    expect(flow.effects).toContainEqual({ type: "effect.locale", locale: "ru" });
  });

  it("shows 1.1a on invalid_code and leaves for 1.2 once a code works", async () => {
    let attempt = 0;
    const flow = startFlow({
      join: async () => {
        attempt += 1;
        if (attempt === 1) throw new JoinFailure("invalid_code");
        return joinOutput();
      },
    });
    await settle();
    flow.actor.send({ type: "JOIN", code: "MATH2-204-TUE", studentNumber: "20231187" });
    await settle();
    const wrong = selectScreen(flow.actor.getSnapshot());
    expect(wrong).toMatchObject({ frame: "1.1a", error: "invalid_code", code: "MATH2-204-TUE", busy: false });
    await joined(flow);
    expect(frame(flow)).toBe("1.2");
  });

  it("refuses a malformed student ID without calling the server", async () => {
    const flow = startFlow();
    await settle();
    flow.actor.send({ type: "JOIN", code: "MATH2-204-FRI", studentNumber: "2023118" });
    await settle();
    expect(flow.joins).toHaveLength(0);
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({ frame: "1.1", error: "invalid_input" });
  });

  it("maps other join errors and a dropped network", async () => {
    const flow = startFlow({
      join: async () => {
        throw new Error("Failed to fetch");
      },
    });
    await settle();
    await joined(flow);
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({ frame: "1.1", error: "network" });
  });
});

describe("1.2 System check", () => {
  it("stays until every row is ready, then goes to 1.3", async () => {
    const flow = startFlow();
    await settle();
    await joined(flow);
    flow.actor.send({
      type: "CHECK_ROWS",
      rows: { ...READY_ROWS, apps: { status: "fail", app: "Telegram" } },
    });
    flow.actor.send({ type: "CONTINUE" });
    const model = selectScreen(flow.actor.getSnapshot());
    expect(model).toMatchObject({
      frame: "1.2",
      canContinue: false,
      apps: { status: "fail", app: "Telegram" },
    });
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ step: "checking", detail: "app:Telegram" });
    expect(wantsDetection(flow.actor.getSnapshot())).toBe("check");
    flow.actor.send({ type: "CHECK_AGAIN" });
    expect(flow.effects).toContainEqual({ type: "effect.systemCheck", action: "again" });
    flow.actor.send({ type: "CHECK_ROWS", rows: READY_ROWS });
    flow.actor.send({ type: "CONTINUE" });
    expect(frame(flow)).toBe("1.3");
  });

  it("reports the first failing row as a status detail the lobby can read", async () => {
    const flow = startFlow();
    await settle();
    await joined(flow);
    const detailFor = (rows: Partial<CheckRows>): string | undefined => {
      flow.actor.send({ type: "CHECK_ROWS", rows: { ...READY_ROWS, ...rows } });
      const status = ingestStatus(flow.actor.getSnapshot());
      expect(IngestStatus.safeParse(status).success, JSON.stringify(status)).toBe(true);
      return status?.detail;
    };
    const camera = (problem: CheckRows["camera"]["problem"]): Partial<CheckRows> => ({
      camera: { status: "fail", faces: null, problem },
    });
    expect(detailFor({})).toBeUndefined();
    expect(detailFor({ screenShare: { status: "fail", app: "AnyDesk" } })).toBe("app:AnyDesk");
    expect(detailFor(camera("no_camera"))).toBe("camera:busy");
    expect(detailFor(camera(null))).toBe("camera:busy");
    expect(detailFor(camera("dark"))).toBe("camera:dark");
    expect(detailFor(camera("many_faces"))).toBe("camera:many_faces");
    expect(detailFor({ network: { status: "fail", ms: null } })).toBe("network:offline");
    expect(detailFor({ network: { status: "fail", ms: 1450 } })).toBe("network:slow");
    expect(detailFor({ lock: "connected" })).toBe("lock:not_paired");
    expect(detailFor({ lock: "absent" })).toBe("lock:not_paired");
    expect(detailFor({ storage: { status: "fail", freeGb: 0.4 } })).toBe("storage:low");
    expect(detailFor({ storage: { status: "fail", freeGb: null } })).toBeUndefined();
    expect(
      detailFor({ apps: { status: "fail", app: "Telegram" }, network: { status: "fail", ms: null } }),
      "the first failing row wins",
    ).toBe("app:Telegram");
  });

  it("needs a paired Üki Lock only when checks.lock is on, and skips 1.3 when checks.identity is off", async () => {
    const flow = startFlow({ join: async () => joinOutput({ lock: false, identity: false }) });
    await settle();
    await joined(flow);
    flow.actor.send({ type: "CHECK_ROWS", rows: { ...READY_ROWS, lock: "absent" } });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      browserLock: { status: "ready", required: false },
    });
    flow.actor.send({ type: "CONTINUE" });
    expect(frame(flow)).toBe("1.4");
  });
});

describe("1.3 Identity and 1.3a Proctor help", () => {
  it("sends identity.matched with score and tries and goes to 1.4 on Continue", async () => {
    const flow = startFlow();
    await settle();
    await joined(flow);
    flow.actor.send({ type: "CHECK_ROWS", rows: READY_ROWS });
    flow.actor.send({ type: "CONTINUE" });
    flow.actor.send({
      type: "IDENTITY_VERDICT",
      kind: "retry",
      tries: 1,
      rows: { face: "ok", card: "fail", person: "ok" },
      score: null,
    });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "1.3",
      tries: 1,
      canContinue: false,
    });
    // The lobby's "Card unreadable · retry 1 of 3".
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ step: "identity", detail: "card:retry:1" });
    flow.actor.send({ type: "CONTINUE" });
    expect(frame(flow)).toBe("1.3");
    flow.actor.send({
      type: "IDENTITY_VERDICT",
      kind: "matched",
      tries: 2,
      rows: { face: "ok", card: "ok", person: "ok" },
      score: 0.82,
    });
    expect(flow.effects).toContainEqual({
      type: "effect.event",
      eventType: "identity.matched",
      data: { score: 0.82, tries: 2 },
    });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "1.3",
      canContinue: true,
      status: "matched",
    });
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ step: "identity" });
    flow.actor.send({ type: "CONTINUE" });
    expect(frame(flow)).toBe("1.4");
  });

  it("opens 1.3a after 3 failed tries with one help request, and leaves for 1.4 on a later match", async () => {
    const flow = startFlow();
    await settle();
    await joined(flow);
    flow.actor.send({ type: "CHECK_ROWS", rows: READY_ROWS });
    flow.actor.send({ type: "CONTINUE" });
    flow.actor.send({ type: "TICK", now: START - 8 * MIN });
    flow.actor.send({
      type: "IDENTITY_VERDICT",
      kind: "help",
      tries: 3,
      rows: { face: "ok", card: "fail", person: "ok" },
      score: null,
    });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "1.3a",
      help: { requestedAt: START - 8 * MIN, proctorName: "Aigerim Sadykova" },
    });
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ step: "identity", detail: "card:help:3" });
    flow.actor.send({
      type: "IDENTITY_VERDICT",
      kind: "help",
      tries: 4,
      rows: { face: "ok", card: "fail", person: "ok" },
      score: null,
    });
    expect(events(flow.effects).filter((t) => t === "student.help_requested")).toHaveLength(1);
    flow.actor.send({
      type: "IDENTITY_VERDICT",
      kind: "matched",
      tries: 5,
      rows: { face: "ok", card: "ok", person: "ok" },
      score: 0.7,
    });
    flow.actor.send({ type: "CONTINUE" });
    expect(frame(flow)).toBe("1.4");
  });

  it("Ask proctor opens 1.3a and sends student.help_requested (identity)", async () => {
    const flow = startFlow();
    await settle();
    await joined(flow);
    flow.actor.send({ type: "CHECK_ROWS", rows: READY_ROWS });
    flow.actor.send({ type: "CONTINUE" });
    flow.actor.send({ type: "ASK_PROCTOR" });
    expect(frame(flow)).toBe("1.3a");
    expect(flow.effects).toContainEqual({
      type: "effect.event",
      eventType: "student.help_requested",
      data: { topic: "identity" },
    });
  });
});

describe("1.4 Rules and lobby", () => {
  it("counts down and opens 2.1 at starts_at once the box is ticked", async () => {
    const flow = startFlow();
    await settle();
    await toRules(flow);
    flow.actor.send({ type: "TICK", now: START - 4 * MIN - 12_000 });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "1.4",
      countdownMs: 4 * MIN + 12_000,
      gazeSeconds: 2,
    });
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ step: "rules" });
    flow.actor.send({ type: "TICK", now: START + 1000 });
    expect(frame(flow)).toBe("1.4");
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({ startReady: true });
    flow.actor.send({ type: "SET_AGREED", agreed: true });
    await settle();
    expect(stageOf(flow.actor.getSnapshot())).toBe("writing");
  });

  it("opens 2.1 at once on the start command, and reports ready while waiting", async () => {
    const flow = startFlow();
    await settle();
    await toRules(flow);
    flow.actor.send({ type: "SET_AGREED", agreed: true });
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ step: "ready" });
    flow.actor.send({ type: "COMMAND", command: command("start", {}, START - 5 * MIN) });
    await settle();
    expect(stageOf(flow.actor.getSnapshot())).toBe("writing");
  });

  it("tells Üki Lock lobby until the box is ticked, and starts at once on a lock.started that came first", async () => {
    const flow = startFlow({ join: async () => joinOutput({ mode: "browser" }) });
    await settle();
    await toRules(flow);
    flow.actor.send({ type: "TICK", now: START + 1000 });
    expect(stageOf(flow.actor.getSnapshot())).toBe("rules");
    // Lock and start stays off in the popup: the exam cannot start before the box is ticked.
    expect(lockExamState(flow.actor.getSnapshot()).phase).toBe("lobby");
    // A Lock that locked anyway (an older exam.state): kept, not dropped.
    flow.actor.send({ type: "LOCK_STARTED", tabsClosed: 2 });
    expect(stageOf(flow.actor.getSnapshot())).toBe("rules");
    expect(events(flow.effects)).not.toContain("exam.started");
    flow.actor.send({ type: "SET_AGREED", agreed: true });
    await settle();
    const snapshot = flow.actor.getSnapshot();
    expect(stageOf(snapshot)).toBe("writing");
    expect(events(flow.effects).filter((type) => type === "exam.started")).toHaveLength(1);
    expect(wantsDetection(snapshot)).toBe("exam");
    expect(wantsHidden(snapshot)).toBe(true);
    expect(lockExamState(snapshot).phase).toBe("writing");
    expect(selectScreen(snapshot)).toMatchObject({ frame: "2.1", browserLocked: { tabsClosed: 2 } });
  });

  it("moves the countdown when an ingest reply shows the exam started early", async () => {
    const flow = startFlow();
    await settle();
    await toRules(flow);
    const early = START - 6 * MIN;
    flow.actor.send({
      type: "SESSION_SYNC",
      session: {
        state: "rules",
        ends_at: new Date(early + 90 * MIN).toISOString(),
        extra_min: 0,
        paused_s: 0,
      },
      serverTime: new Date(early + 1000).toISOString(),
    });
    flow.actor.send({ type: "TICK", now: early + 2000 });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "1.4",
      countdownMs: 0,
      startReady: true,
    });
  });
});

describe("2.1 Exam and its states", () => {
  it("opens 2.1 with lockdown, lock.start, exam.started and the questions", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    const snapshot = flow.actor.getSnapshot();
    expect(wantsLockdown(snapshot)).toBe(true);
    expect(wantsDetection(snapshot)).toBe("exam");
    expect(flow.effects).toContainEqual({ type: "effect.lockStart" });
    expect(events(flow.effects)).toContain("exam.started");
    const model = selectScreen(snapshot);
    expect(model).toMatchObject({
      frame: "2.1",
      question: { n: 1, total: 20, body: "Сұрақ 1" },
      isLast: false,
      canGoBack: false,
    });
    expect(lockExamState(snapshot)).toMatchObject({ phase: "writing", watch: "watching", locale: "kk" });
  });

  it("saves answers on the laptop and moves between questions", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "TICK", now: START + 47 * MIN });
    flow.actor.send({ type: "SELECT_CHOICE", questionId: QUESTION_IDS[0] ?? "", choiceId: "a" });
    expect(flow.effects).toContainEqual({
      type: "effect.answer",
      questionId: QUESTION_IDS[0],
      choiceId: "a",
      savedAt: START + 47 * MIN,
    });
    expect(flow.effects).toContainEqual({
      type: "effect.event",
      eventType: "answer.saved",
      data: { question_id: QUESTION_IDS[0] },
    });
    flow.actor.send({ type: "SELECT_CHOICE", questionId: QUESTION_IDS[0] ?? "", choiceId: "zz" });
    flow.actor.send({ type: "NEXT_QUESTION" });
    flow.actor.send({ type: "SET_LOCALE", locale: "en" });
    const model = selectScreen(flow.actor.getSnapshot());
    expect(model).toMatchObject({
      frame: "2.1",
      question: { n: 2, body: "Question 2" },
      savedAt: START + 47 * MIN,
      answeredCount: 1,
      canGoBack: true,
    });
    expect(model.frame === "2.1" && model.log[0]).toMatchObject({ kind: "question_saved", n: 1 });
    expect(ingestStatus(flow.actor.getSnapshot())).toEqual({ question: 2 });
  });

  it("2.2: the phone warning shows and clears", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "CUE_PHONE", on: true, score: 0.94, at: START + MIN });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.2",
      phone: { score: 0.94 },
      watch: { state: "phone" },
    });
    expect(lockExamState(flow.actor.getSnapshot()).watch).toBe("phone_found");
    flow.actor.send({ type: "CUE_PHONE", on: false, score: null, at: START + MIN + 3000 });
    expect(frame(flow)).toBe("2.1");
  });

  it("2.3: no face pauses and stops the timer; I'm here resumes", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "TICK", now: START + 50 * MIN });
    flow.actor.send({ type: "CUE_PAUSED", on: true, reason: "face_missing", at: START + 50 * MIN });
    flow.actor.send({ type: "TICK", now: START + 50 * MIN + 42_000 });
    const paused = selectScreen(flow.actor.getSnapshot());
    expect(paused).toMatchObject({
      frame: "2.3",
      selfPause: { pausedMs: 42_000 },
      timer: { running: false, remainingMs: 40 * MIN },
    });
    expect(lockExamState(flow.actor.getSnapshot()).phase).toBe("paused");
    flow.actor.send({ type: "IM_HERE" });
    expect(flow.effects).toContainEqual({ type: "effect.resume" });
    flow.actor.send({ type: "CUE_PAUSED", on: false, reason: null, at: START + 50 * MIN + 42_000 });
    const back = selectScreen(flow.actor.getSnapshot());
    expect(back).toMatchObject({ frame: "2.1", timer: { running: true, remainingMs: 40 * MIN } });
  });

  it("2.1a: offline shows the banner and the timer keeps running; the next sync ends it", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "CONNECTIVITY", offline: true, since: START + 52 * MIN + 14_000 });
    flow.actor.send({ type: "TICK", now: START + 52 * MIN + 30_000 });
    const model = selectScreen(flow.actor.getSnapshot());
    expect(model).toMatchObject({
      frame: "2.1a",
      titleBar: { variant: "offline" },
      watch: { state: "offline", elapsedMs: 16_000 },
      timer: { running: true },
    });
    expect(model.frame === "2.1a" && model.log[0]).toMatchObject({ kind: "network_lost" });
    flow.actor.send({ type: "CONNECTIVITY", offline: false, since: null });
    expect(frame(flow)).toBe("2.1");
  });

  it("2.1c: the proctor's pause stops the timer until the resume command", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "TICK", now: START + 49 * MIN + 30_000 });
    flow.actor.send({
      type: "COMMAND",
      command: command("pause", { text: "Stay in your seat." }, START + 49 * MIN + 30_000),
    });
    flow.actor.send({ type: "TICK", now: START + 50 * MIN + 45_000 });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1c",
      titleBar: { variant: "proctor_paused" },
      proctorPause: { proctorName: "Aigerim Sadykova", text: "Stay in your seat.", pausedMs: 75_000 },
      timer: { running: false, remainingMs: 40 * MIN + 30_000 },
    });
    expect(wantsDetection(flow.actor.getSnapshot())).toBe("idle");
    flow.actor.send({ type: "IM_HERE" });
    expect(frame(flow)).toBe("2.1c");
    flow.actor.send({ type: "COMMAND", command: command("resume", {}, START + 50 * MIN + 45_000) });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1",
      timer: { running: true, remainingMs: 40 * MIN + 30_000 },
    });
  });

  it("2.1c takes over from 2.3: I'm here no longer resumes, only the resume command does", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "TICK", now: START + 50 * MIN });
    flow.actor.send({ type: "CUE_PAUSED", on: true, reason: "face_missing", at: START + 50 * MIN });
    flow.actor.send({ type: "TICK", now: START + 51 * MIN });
    expect(frame(flow)).toBe("2.3");
    // The proctor paused while the app was offline in 2.3; the command comes in now.
    flow.actor.send({
      type: "COMMAND",
      command: command("pause", { text: "Stay in your seat." }, START + 50 * MIN + 30_000),
    });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1c",
      proctorPause: { text: "Stay in your seat.", pausedMs: 30_000 },
      timer: { running: false, remainingMs: 40 * MIN },
    });
    expect(lockExamState(flow.actor.getSnapshot()).phase).toBe("paused");
    const resumes = () => flow.effects.filter((e) => e.type === "effect.resume").length;
    const before = resumes();
    flow.actor.send({ type: "IM_HERE" });
    flow.actor.send({ type: "CUE_PAUSED", on: false, reason: null, at: START + 51 * MIN });
    expect(resumes()).toBe(before);
    expect(frame(flow)).toBe("2.1c");
    flow.actor.send({ type: "TICK", now: START + 52 * MIN });
    flow.actor.send({ type: "COMMAND", command: command("resume", {}, START + 52 * MIN) });
    // 30 s of self-pause and 90 s of the proctor's pause given back: the timer did not move.
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1",
      timer: { running: true, remainingMs: 40 * MIN },
    });
  });

  it("2.1e: a message and added time show until Got it, and the end moves", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "TICK", now: START + 31 * MIN });
    flow.actor.send({
      type: "COMMAND",
      command: command("add_time", { minutes: 10, scope: "group" }, START + 31 * MIN),
    });
    flow.actor.send({
      type: "COMMAND",
      command: command(
        "message",
        { preset: "message.preset.phones_away", scope: "student" },
        START + 31 * MIN,
      ),
    });
    const model = selectScreen(flow.actor.getSnapshot());
    expect(model).toMatchObject({
      frame: "2.1e",
      notice: {
        message: { preset: "message.preset.phones_away", text: null },
        timeAdded: { minutes: 10, endsAt: START + 100 * MIN },
      },
      timer: { addedMinutes: 10, remainingMs: 69 * MIN },
    });
    flow.actor.send({ type: "ACK_NOTICE" });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1",
      timer: { addedMinutes: null, remainingMs: 69 * MIN },
    });
  });
});

describe("3.1 Submitted and 2.1d Ended", () => {
  it("submits on the last question and shows the receipt; lockdown ends", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "SUBMIT" });
    expect(stageOf(flow.actor.getSnapshot())).toBe("submitting");
    expect(wantsLockdown(flow.actor.getSnapshot())).toBe(true);
    await settle();
    const model = selectScreen(flow.actor.getSnapshot());
    expect(model).toMatchObject({
      frame: "3.1",
      receiptId: "UKI-204-0917-MT",
      timeUsedMin: 87,
      totalMin: 90,
      flags: 3,
      state: "submitted",
    });
    expect(flow.effects).toContainEqual({ type: "effect.finish", reason: "submitted" });
    expect(wantsLockdown(flow.actor.getSnapshot())).toBe(false);
    expect(wantsDetection(flow.actor.getSnapshot())).toBe("off");
    flow.actor.send({ type: "CLOSE_APP" });
    expect(flow.effects).toContainEqual({ type: "effect.quit" });
  });

  it("time up auto-submits to 3.1 with exam.time_up", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "TICK", now: START + 90 * MIN });
    await settle();
    expect(flow.submits).toEqual(["time_up"]);
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({ frame: "3.1", state: "time_up" });
    expect(flow.effects).toContainEqual({ type: "effect.finish", reason: "time_up" });
  });

  it("the end command flushes, submits and shows 2.1d with the reason", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({ type: "SELECT_CHOICE", questionId: QUESTION_IDS[0] ?? "", choiceId: "b" });
    flow.actor.send({ type: "TICK", now: START + 58 * MIN });
    flow.actor.send({
      type: "COMMAND",
      command: command("end", { reason: "Phone used twice" }, START + 58 * MIN),
    });
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({ frame: "2.1d", receiptId: null });
    await settle();
    expect(flow.submits).toEqual(["ended"]);
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1d",
      proctorName: "Aigerim Sadykova",
      endedAt: START + 58 * MIN,
      receiptId: "UKI-204-0917-MT",
      answered: 1,
      total: 20,
      reason: "Phone used twice",
      contactEmail: "exams@kru.test",
    });
    expect(flow.effects).toContainEqual({ type: "effect.finish", reason: "ended" });
  });

  it("an ingest reply saying ended also leads to 2.1d", async () => {
    const flow = startFlow();
    await settle();
    await toExam(flow);
    flow.actor.send({
      type: "SESSION_SYNC",
      session: {
        state: "ended",
        ends_at: new Date(START + 90 * MIN).toISOString(),
        extra_min: 0,
        paused_s: 0,
      },
      serverTime: new Date(START + 40 * MIN).toISOString(),
    });
    await settle();
    expect(frame(flow)).toBe("2.1d");
  });
});

describe("restart", () => {
  it("rejoins with the saved code and resumes the exam without a second exam.started", async () => {
    const flow = startFlow({
      saved: { code: "MATH2-204-FRI", studentNumber: "20231187", locale: "ru" },
      join: async () => joinOutput({ state: "writing", withQuestions: true }),
      now: START + 10 * MIN,
    });
    await settle();
    expect(flow.joins).toEqual([{ code: "MATH2-204-FRI", studentNumber: "20231187", locale: "ru" }]);
    expect(stageOf(flow.actor.getSnapshot())).toBe("writing");
    expect(events(flow.effects)).not.toContain("exam.started");
    expect(selectScreen(flow.actor.getSnapshot())).toMatchObject({
      frame: "2.1",
      locale: "ru",
      question: { body: "Вопрос 1" },
    });
    expect(wantsLockdown(flow.actor.getSnapshot())).toBe(true);
  });

  it("asks for the receipt again for a session already submitted", async () => {
    const flow = startFlow({
      saved: { code: "MATH2-204-FRI", studentNumber: "20231187", locale: "kk" },
      join: async () => joinOutput({ state: "submitted" }),
    });
    await settle();
    await settle();
    expect(frame(flow)).toBe("3.1");
    expect(wantsLockdown(flow.actor.getSnapshot())).toBe(false);
  });
});

describe("browser exams", () => {
  async function toBrowserExam(flow: Flow): Promise<void> {
    await toRules(flow);
    flow.actor.send({ type: "SET_AGREED", agreed: true });
    flow.actor.send({ type: "TICK", now: START });
    await settle();
  }

  it("hides the window at the start and sends exam.started when Üki Lock reports lock.started", async () => {
    const flow = startFlow({ join: async () => joinOutput({ mode: "browser" }) });
    await settle();
    await toBrowserExam(flow);
    let snapshot = flow.actor.getSnapshot();
    expect(stageOf(snapshot)).toBe("waitingLock");
    expect(wantsHidden(snapshot)).toBe(true);
    expect(wantsLockdown(snapshot)).toBe(false);
    expect(lockExamState(snapshot)).toMatchObject({
      phase: "ready",
      exam: { mode: "browser", allowed_hosts: ["localhost:5180"], done_path: "/physics-1/quiz-3/review" },
    });
    expect(events(flow.effects)).not.toContain("exam.started");
    expect(flow.effects).not.toContainEqual({ type: "effect.lockStart" });
    flow.actor.send({ type: "LOCK_STARTED", tabsClosed: 3 });
    snapshot = flow.actor.getSnapshot();
    expect(events(flow.effects)).toContain("exam.started");
    expect(stageOf(snapshot)).toBe("writing");
    expect(wantsDetection(snapshot)).toBe("exam");
    expect(selectScreen(snapshot)).toMatchObject({
      frame: "2.1",
      question: null,
      browserLocked: { tabsClosed: 3 },
      titleBar: { variant: "locked" },
    });
  });

  it("does not pause on a missing face, and brings the window back for pause and message", async () => {
    const flow = startFlow({ join: async () => joinOutput({ mode: "browser" }) });
    await settle();
    await toBrowserExam(flow);
    flow.actor.send({ type: "LOCK_STARTED", tabsClosed: 2 });
    flow.actor.send({ type: "CUE_PAUSED", on: true, reason: "face_missing", at: START + MIN });
    expect(stageOf(flow.actor.getSnapshot())).toBe("writing");
    flow.actor.send({ type: "COMMAND", command: command("pause", {}, START + 2 * MIN) });
    expect(frame(flow)).toBe("2.1c");
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(false);
    flow.actor.send({ type: "COMMAND", command: command("resume", {}, START + 3 * MIN) });
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(true);
    flow.actor.send({
      type: "COMMAND",
      command: command("message", { text: "Five minutes left", scope: "group" }),
    });
    expect(frame(flow)).toBe("2.1e");
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(false);
    flow.actor.send({ type: "ACK_NOTICE" });
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(true);
  });

  it("watches the exam (process scan, quit held) from lock.started until 3.1, also while 2.1c and 2.1e show", async () => {
    const flow = startFlow({ join: async () => joinOutput({ mode: "browser" }) });
    await settle();
    await toBrowserExam(flow);
    expect(wantsExamWatch(flow.actor.getSnapshot())).toBe(false);
    flow.actor.send({ type: "LOCK_STARTED", tabsClosed: 2 });
    expect(wantsExamWatch(flow.actor.getSnapshot())).toBe(true);
    flow.actor.send({ type: "COMMAND", command: command("pause", {}, START + 2 * MIN) });
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(false);
    expect(wantsExamWatch(flow.actor.getSnapshot())).toBe(true);
    flow.actor.send({ type: "COMMAND", command: command("resume", {}, START + 3 * MIN) });
    flow.actor.send({
      type: "COMMAND",
      command: command("message", { text: "Five minutes left", scope: "group" }),
    });
    expect(frame(flow)).toBe("2.1e");
    expect(wantsExamWatch(flow.actor.getSnapshot())).toBe(true);
    flow.actor.send({ type: "LOCK_SUBMITTED" });
    expect(wantsExamWatch(flow.actor.getSnapshot())).toBe(true);
    await settle();
    expect(frame(flow)).toBe("3.1");
    expect(wantsExamWatch(flow.actor.getSnapshot())).toBe(false);
  });

  it("submits when Üki Lock reports exam.submitted and shows 3.1 in the window", async () => {
    const flow = startFlow({ join: async () => joinOutput({ mode: "browser" }) });
    await settle();
    await toBrowserExam(flow);
    flow.actor.send({ type: "LOCK_STARTED", tabsClosed: 2 });
    flow.actor.send({ type: "LOCK_SUBMITTED" });
    await settle();
    expect(flow.submits).toEqual(["submitted"]);
    expect(frame(flow)).toBe("3.1");
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(false);
    expect(lockExamState(flow.actor.getSnapshot()).phase).toBe("done");
    expect(flow.effects).toContainEqual({ type: "effect.finish", reason: "submitted" });
  });

  it("an end command brings the window back with 2.1d", async () => {
    const flow = startFlow({ join: async () => joinOutput({ mode: "browser" }) });
    await settle();
    await toBrowserExam(flow);
    flow.actor.send({ type: "LOCK_STARTED", tabsClosed: 2 });
    flow.actor.send({ type: "COMMAND", command: command("end", { reason: "Left the room" }) });
    expect(frame(flow)).toBe("2.1d");
    expect(wantsHidden(flow.actor.getSnapshot())).toBe(false);
  });
});

it("uses the session id for submit", async () => {
  const seen: string[] = [];
  const flow = startFlow({
    submit: async (input) => {
      seen.push(input.sessionId);
      return { receiptId: "UKI-204-0001-MT", timeUsedS: 60, state: "submitted", flags: 0, at: START };
    },
  });
  await settle();
  await toExam(flow);
  flow.actor.send({ type: "SUBMIT" });
  await settle();
  expect(seen).toEqual([SESSION_ID]);
});

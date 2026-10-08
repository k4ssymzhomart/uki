import { describe, expect, it } from "vitest";
import { IngestStatus } from "../../../packages/contracts/src/index.ts";
import { type CastMember, LOBBY_ROLES, planCast, WALL_ROLES } from "./cast.ts";
import { draftsFor, toBatchEvent } from "./events.ts";
import { seedRoster } from "./fixtures.ts";
import { createRng } from "./rng.ts";
import {
  joinDelay,
  LOBBY_STEPS,
  type Planned,
  planCatchUp,
  planExam,
  planLobby,
  STATUS_DETAIL,
  stepRank,
} from "./script.ts";

const SESSION = "0199b8f0-0000-7000-8000-000000000001";
const MIN = 60_000;

function member(lobby: CastMember["lobby"], wall: CastMember["wall"]): CastMember {
  return {
    studentId: "b0000000-0000-4000-8000-000020235001",
    seat: 1,
    number: "20235001",
    name: "Test Student",
    locale: "kk",
    lobby,
    wall,
    os: "macos",
    short: "Test S.",
  };
}

/** Every event an action sends must pass the contracts' ClientEventEnvelope. */
function validate(plan: Planned[]): void {
  let seq = 0;
  for (const step of plan) {
    for (const draft of draftsFor(step.action, { nowMs: Date.now(), gazeS: 2, faceMissingS: 10 })) {
      seq += 1;
      expect(() => toBatchEvent(SESSION, seq, draft), `${step.action.kind} ${draft.type}`).not.toThrow();
    }
  }
}

function statusSteps(plan: Planned[]) {
  return plan.flatMap((step) => (step.action.kind === "status" ? [step.action] : []));
}

describe("planLobby", () => {
  it.each(LOBBY_ROLES)("%s: steps only move forward and every event is valid", (role) => {
    const plan = planLobby(member(role, "normal"), createRng(7));
    const ranks = statusSteps(plan).map((s) => stepRank(s.step));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const times = plan.map((s) => s.atSimMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    validate(plan);
  });

  it("reaches ready within a minute for a normal student", () => {
    const plan = planLobby(member("normal", "normal"), createRng(3));
    const last = plan[plan.length - 1];
    expect(last?.action).toEqual({ kind: "status", step: "ready" });
    expect(last?.atSimMs).toBeLessThan(60_000);
    expect(plan.some((s) => s.action.kind === "identity_matched")).toBe(true);
  });

  it("leaves the three stuck students on 1.2 and 1.3 with the 1.5 details", () => {
    const last = (role: CastMember["lobby"]) =>
      statusSteps(planLobby(member(role, "normal"), createRng(1))).at(-1);
    expect(last("help_app")).toEqual({
      kind: "status",
      step: "checking",
      detail: STATUS_DETAIL.blockedApp("Telegram"),
    });
    expect(last("help_camera")).toEqual({ kind: "status", step: "checking", detail: "camera:busy" });
    expect(last("help_identity")).toEqual({ kind: "status", step: "identity", detail: "card:retry:2" });
    expect(STATUS_DETAIL.blockedApp("Telegram")).toBe("app:Telegram");
    for (const role of ["help_app", "help_camera", "help_identity"] as const) {
      const detail = last(role)?.detail;
      expect(IngestStatus.safeParse({ step: "checking", detail }).success, role).toBe(true);
    }
  });

  it("joins late students only after the start", () => {
    expect(joinDelay(member("late", "normal"), createRng(1))).toBeNull();
    expect(planLobby(member("late", "normal"), createRng(1))).toEqual([]);
    const delay = joinDelay(member("normal", "normal"), createRng(1));
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThan(45_000);
  });
});

describe("planCatchUp", () => {
  it.each(LOBBY_STEPS)("from %s it ends with exam.started after ready", (from) => {
    for (const role of LOBBY_ROLES) {
      const plan = planCatchUp(member(role, "normal"), from, createRng(5));
      expect(plan.at(-1)?.action.kind).toBe("start");
      const start = plan.at(-1)?.atSimMs ?? 0;
      expect(plan.every((s) => s.atSimMs <= start)).toBe(true);
      validate(plan);
    }
  });

  it("starts students waiting on 1.4 within 3 s and matches the stuck card on the third try", () => {
    const ready = planCatchUp(member("normal", "normal"), "ready", createRng(2));
    expect(ready).toHaveLength(1);
    expect(ready[0]?.atSimMs).toBeLessThanOrEqual(3000);
    const card = planCatchUp(member("help_identity", "normal"), "identity", createRng(2));
    expect(card.find((s) => s.action.kind === "identity_matched")?.action).toMatchObject({ tries: 3 });
    expect(card[0]?.atSimMs).toBeGreaterThanOrEqual(20_000);
  });
});

describe("planExam", () => {
  const options = { questions: 20, durationMin: 90 };

  it.each(WALL_ROLES)("%s: valid events, questions in order, submit last and inside the exam", (role) => {
    const plan = planExam(member("normal", role), createRng(11), options);
    validate(plan);
    const last = plan.at(-1);
    expect(last?.action.kind).toBe("submit");
    expect(last?.atSimMs).toBeLessThanOrEqual(88 * MIN);
    const questions = plan.flatMap((s) => (s.action.kind === "question" ? [s.action.question] : []));
    expect(questions).toEqual([...questions].sort((a, b) => a - b));
    expect(Math.max(0, ...questions)).toBeLessThanOrEqual(20);
  });

  it("plays each 2.4 moment in the first three minutes", () => {
    const first = (role: CastMember["wall"]) =>
      planExam(member("normal", role), createRng(4), options).find(
        (s) => s.action.kind !== "question" && s.atSimMs < 3 * MIN,
      )?.action;
    expect(first("phone")).toEqual({ kind: "phone", score: 0.94, heldMs: 800 });
    expect(first("second_face")).toEqual({ kind: "second_face", durationMs: 4000 });
    expect(first("tab_blocked")).toEqual({ kind: "tab_blocked", host: "www.google.com" });
    expect(first("look_away_once")).toMatchObject({ kind: "look_away", durationMs: 2400 });
    expect(first("face_missing")).toMatchObject({ kind: "self_pause", cause: "face_missing" });
    expect(first("camera_lost")).toMatchObject({ kind: "self_pause", cause: "camera_lost" });
    expect(first("offline")).toEqual({ kind: "go_offline", realMs: 60_000 });
    const looks = planExam(member("normal", "look_away_3x"), createRng(4), options).filter(
      (s) => s.action.kind === "look_away" && s.atSimMs < 3 * MIN,
    );
    expect(looks).toHaveLength(3);
    const total = looks.reduce(
      (sum, s) => sum + (s.action.kind === "look_away" ? s.action.durationMs : 0),
      0,
    );
    expect(Math.round(total / 1000)).toBe(6);
  });

  it("sends a student's help request at its time, as an event the contracts accept", () => {
    const asker: CastMember = {
      ...member("normal", "normal"),
      help: {
        atSimMs: 70_000,
        topic: "technical",
        text: "My camera froze for a second. Is my exam still running?",
      },
    };
    const plan = planExam(asker, createRng(4), options);
    validate(plan);
    const help = plan.filter((s) => s.action.kind === "help");
    expect(help).toEqual([
      {
        atSimMs: 70_000,
        action: {
          kind: "help",
          topic: "technical",
          text: "My camera froze for a second. Is my exam still running?",
        },
      },
    ]);
    expect(
      planExam(member("normal", "normal"), createRng(4), options).some((s) => s.action.kind === "help"),
    ).toBe(false);
  });

  it("submits early students after four to seven minutes", () => {
    const at = planExam(member("normal", "early_submit"), createRng(9), options).at(-1)?.atSimMs ?? 0;
    expect(at).toBeGreaterThanOrEqual(4 * MIN);
    expect(at).toBeLessThanOrEqual(7 * MIN);
  });

  it("keeps the whole class to about one look away a minute", () => {
    const cast = planCast(seedRoster(), {
      count: 120,
      skipNumbers: new Set(["20231187"]),
      takenStudentIds: new Set(),
      seed: 1,
    });
    const root = createRng(1);
    const looks = cast.members
      .flatMap((m) => planExam(m, root.fork(m.studentId), options))
      .filter((s) => s.action.kind === "look_away" && s.atSimMs >= 4 * MIN);
    expect(looks.length).toBeGreaterThan(40);
    expect(looks.length).toBeLessThan(110);
  });
});

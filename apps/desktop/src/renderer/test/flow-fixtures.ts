// Fixtures for flow tests: a join_exam reply shaped like the seed's Mathematics 2 exam, and a running
// flow actor with fake join, questions and submit actors that records every emitted effect.
import type { JoinExamOutput, Question, ReleaseReason, SessionState } from "@uki/contracts";
import { createActor, fromPromise } from "xstate";
import { studentFlowMachine } from "../flow/machine.ts";
import type { FlowEffect, SavedJoin, SubmitResult } from "../flow/types.ts";
import { EXAM_ID, QUESTION_IDS, SESSION_ID } from "./harness.ts";

export const START = Date.parse("2026-10-09T10:00:00.000Z");
export const MIN = 60_000;

export function questions(count = 20): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    id: QUESTION_IDS[i] ?? `c0000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    position: i + 1,
    body: { kk: `Сұрақ ${i + 1}`, ru: `Вопрос ${i + 1}`, en: `Question ${i + 1}` },
    choices: ["a", "b", "c", "d"].map((id) => ({
      id,
      body: { kk: `${id} kk`, ru: `${id} ru`, en: `${id} en` },
    })),
  }));
}

export function joinOutput(
  overrides: {
    state?: SessionState;
    mode?: "app" | "browser";
    identity?: boolean;
    lock?: boolean;
    startsAt?: number;
    withQuestions?: boolean;
  } = {},
): JoinExamOutput {
  const startsAt = overrides.startsAt ?? START;
  const mode = overrides.mode ?? "app";
  return {
    session: {
      id: SESSION_ID,
      state: overrides.state ?? "joined",
      locale: "kk",
      started_at: null,
      extra_min: 0,
      paused_s: 0,
    },
    exam: {
      id: EXAM_ID,
      title: mode === "app" ? "Mathematics 2 · Midterm" : "Physics 1 · Quiz 3",
      course: mode === "app" ? "Mathematics 2" : "Physics 1",
      kind: mode === "app" ? "Midterm" : "Quiz 3",
      mode,
      starts_at: new Date(startsAt).toISOString(),
      duration_min: 90,
      lobby_opens_at: new Date(startsAt - 20 * MIN).toISOString(),
      status: "scheduled",
      checks: {
        gaze_s: 2,
        phone_score: 0.85,
        face_missing_s: 10,
        identity: overrides.identity ?? true,
        lock: overrides.lock ?? true,
      },
      lms_url: mode === "browser" ? "http://localhost:5180/physics-1/quiz-3" : null,
      lms_done_path: mode === "browser" ? "/physics-1/quiz-3/review" : null,
      allowed_sites: [],
    },
    student: {
      id: "b0000000-0000-4000-8000-000020231187",
      full_name: "Madina Tulegenova",
      student_number: "20231187",
    },
    proctor_name: "Aigerim Sadykova",
    questions: overrides.withQuestions ? questions() : null,
    server_time: new Date(startsAt - 10 * MIN).toISOString(),
  };
}

export interface FlowHarnessOptions {
  join?: (input: SavedJoin) => Promise<JoinExamOutput>;
  saved?: SavedJoin | null;
  submit?: (input: { sessionId: string; reason: ReleaseReason }) => Promise<SubmitResult>;
  now?: number;
}

/** A started flow actor; `effects` collects every emitted effect in order. */
export function startFlow(options: FlowHarnessOptions = {}) {
  const effects: FlowEffect[] = [];
  const joins: SavedJoin[] = [];
  const submits: string[] = [];
  const machine = studentFlowMachine.provide({
    actors: {
      restore: fromPromise(async () => options.saved ?? null),
      joinExam: fromPromise(async ({ input }: { input: SavedJoin }) => {
        joins.push(input);
        return options.join ? options.join(input) : joinOutput();
      }),
      loadQuestions: fromPromise(async () => questions()),
      submit: fromPromise(
        async ({ input }: { input: { sessionId: string; reason: ReleaseReason } }): Promise<SubmitResult> => {
          submits.push(input.reason);
          return options.submit
            ? options.submit(input)
            : {
                receiptId: "UKI-204-0917-MT",
                timeUsedS: 87 * 60,
                state:
                  input.reason === "time_up"
                    ? ("time_up" as const)
                    : input.reason === "ended"
                      ? ("ended" as const)
                      : ("submitted" as const),
                flags: 3,
                at: START + 88 * MIN,
              };
        },
      ),
    },
  });
  const actor = createActor(machine, {
    input: {
      locale: "kk",
      device: { os: "macos", appVersion: "1.4.2" },
      contactEmail: "exams@kru.test",
      now: options.now ?? START - 10 * MIN,
    },
  });
  actor.on("*", (effect) => effects.push(effect as FlowEffect));
  actor.start();
  return { actor, effects, joins, submits };
}

/** Lets promise actors settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Every 1.2 row ready. */
export const READY_ROWS = {
  camera: { status: "ready", faces: 1, problem: null },
  network: { status: "ready", ms: 38 },
  lock: "paired",
  apps: { status: "ready", app: null },
  screenShare: { status: "ready", app: null },
  storage: { status: "ready", freeGb: 120 },
} as const;

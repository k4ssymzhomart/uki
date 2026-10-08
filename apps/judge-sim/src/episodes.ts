// What a simulated student does on the wall: episodes, each one or more ingest calls with the events the
// desktop app would send (packages/detection's rules: a look away is sent when it ends, with `at` at the
// threshold crossing; an empty seat sends face.missing and session.paused together), the flagged stills
// it would upload, and the broadcasts and Edge Function calls each one costs (budget.ts). Pure.
import type { ClientEventType, HelpTopic, IngestStatus, Locale } from "@uki/contracts";
import type { Rng } from "./rng.ts";

/** The stills bundled with the simulator (stills/*.jpg, 640 × 360, from the brand kit's evidence art). */
export const STILL_FILES = {
  phone: "phone.jpg",
  lookingDown: "looking-down.jpg",
  lookedAway: "looked-away.jpg",
  secondPerson: "second-person.jpg",
  emptySeat: "empty-seat.jpg",
} as const;
export type StillName = keyof typeof STILL_FILES;

/** Incidents: what the wall flags or logs. */
export const INCIDENT_KINDS = [
  "phone_hand",
  "phone_raised",
  "look_down",
  "glance_left",
  "glance_right",
  "second_face",
  "absent",
  "app_switch",
  "forbidden_app",
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export type EpisodeKind = IncidentKind | "answer" | "ask_proctor";

/** One event of a step. `offsetMs` is its `at` relative to the moment the step is sent (0 or less). */
export interface EventDraft {
  type: ClientEventType;
  data: Record<string, unknown>;
  offsetMs: number;
  /** The stills uploaded for it (frame_count = stills.length). */
  stills: StillName[];
}

/** An answer the step saves (answers upsert) before its answer.saved event. */
export interface AnswerDraft {
  questionId: string;
  choiceId: string;
}

/** One ingest call, `afterMs` after the episode began. */
export interface EpisodeStep {
  afterMs: number;
  events: EventDraft[];
  status?: IngestStatus;
  answer?: AnswerDraft;
}

export interface EpisodePlan {
  kind: EpisodeKind;
  steps: EpisodeStep[];
}

/** The question a student answers next. */
export interface NextQuestion {
  id: string;
  /** 1-based position. */
  position: number;
  choiceIds: readonly string[];
}

export interface EpisodeContext {
  /** exams.checks.gaze_s: a look away is flagged from this many seconds. */
  gazeS: number;
  /** exams.checks.face_missing_s. */
  faceMissingS: number;
  locale: Locale;
  /** For `answer`; null when the student has answered everything. */
  next: NextQuestion | null;
  /** Questions in the exam, for the status line after an answer. */
  questionCount: number;
}

const S = 1000;

/** Simulated students' notes for Ask proctor, in their language: data typed by a student, not UI. */
const HELP_NOTES: Record<Locale, Partial<Record<HelpTopic, readonly string[]>>> = {
  kk: {
    question: ["3-сұрақта жауап радианмен бе?", "7-сұрақтағы шартты түсінбедім."],
    technical: ["Камера бір секундқа өшіп қалды."],
  },
  ru: {
    question: ["В вопросе 5 ответ в градусах?", "Можно уточнить условие вопроса 8?"],
    technical: ["Экран на секунду погас."],
  },
  en: {
    question: ["Is question 4 in radians or degrees?", "Question 9 seems to have two right answers."],
    technical: ["My camera light flickered for a second."],
  },
};

const HELP_TOPICS_ASKED: readonly HelpTopic[] = ["question", "question", "technical", "break"];

function lookAway(
  type: "gaze.down" | "gaze.off_screen",
  durationMs: number,
  ctx: EpisodeContext,
  data: object,
) {
  const crossing = -durationMs + ctx.gazeS * S - 300;
  const still: StillName = type === "gaze.down" ? "lookingDown" : "lookedAway";
  return [
    { type, data: { duration_ms: durationMs, ...data }, offsetMs: Math.round(crossing), stills: [still] },
    { type: "gaze.on_screen" as const, data: {}, offsetMs: 0, stills: [] },
  ] satisfies EventDraft[];
}

/** The plan of one episode. Scores, durations and pauses vary with `rng`; the shape does not. */
export function planEpisode(kind: EpisodeKind, rng: Rng, ctx: EpisodeContext): EpisodePlan {
  const one = (events: EventDraft[], extra: Partial<EpisodeStep> = {}): EpisodePlan => ({
    kind,
    steps: [{ afterMs: 0, events, ...extra }],
  });
  switch (kind) {
    case "phone_hand":
      return one([
        {
          type: "phone.detected",
          data: { score: round2(rng.between(0.86, 0.93)), held_ms: rng.int(2500, 6000) },
          offsetMs: 0,
          stills: ["phone"],
        },
      ]);
    case "phone_raised":
      return one([
        {
          type: "phone.detected",
          data: { score: round2(rng.between(0.95, 0.99)), held_ms: rng.int(1500, 4000) },
          offsetMs: 0,
          stills: ["phone", "phone"],
        },
      ]);
    case "look_down":
      return one(lookAway("gaze.down", rng.int(4000, 9000), ctx, {}));
    case "glance_left":
    case "glance_right":
      return one(
        lookAway("gaze.off_screen", rng.int(2500, 5000), ctx, {
          direction: kind === "glance_left" ? "left" : "right",
        }),
      );
    case "second_face":
      return one([
        {
          type: "face.second",
          data: { duration_ms: rng.int(2000, 6000), faces: 2 },
          offsetMs: -1000,
          stills: ["secondPerson", "secondPerson"],
        },
      ]);
    case "absent": {
      const pausedMs = rng.int(20, 60) * S;
      return {
        kind,
        steps: [
          {
            afterMs: 0,
            events: [
              {
                type: "face.missing",
                data: { duration_ms: ctx.faceMissingS * S },
                offsetMs: 0,
                stills: ["emptySeat"],
              },
              { type: "session.paused", data: { reason: "face_missing" }, offsetMs: 0, stills: [] },
            ],
          },
          {
            afterMs: pausedMs,
            events: [
              {
                type: "session.resumed",
                data: { paused_ms: pausedMs, by: "student" },
                offsetMs: 0,
                stills: [],
              },
            ],
          },
        ],
      };
    }
    case "app_switch":
      return one([{ type: "tab.blocked", data: { app: null }, offsetMs: 0, stills: [] }]);
    case "forbidden_app":
      return one([{ type: "tab.blocked", data: { app: "Telegram" }, offsetMs: 0, stills: [] }]);
    case "answer": {
      const next = ctx.next;
      if (next === null || next.choiceIds.length === 0) return { kind, steps: [] };
      // The question on screen after this answer: the next one, or the first again after the last.
      const position = next.position >= ctx.questionCount ? 1 : next.position + 1;
      return one([{ type: "answer.saved", data: { question_id: next.id }, offsetMs: 0, stills: [] }], {
        answer: { questionId: next.id, choiceId: rng.pick(next.choiceIds) },
        status: { question: position },
      });
    }
    case "ask_proctor": {
      const topic = rng.pick(HELP_TOPICS_ASKED);
      const notes = HELP_NOTES[ctx.locale][topic];
      const data = notes && rng.chance(0.8) ? { topic, text: rng.pick(notes) } : { topic };
      return one([{ type: "student.help_requested", data, offsetMs: 0, stills: [] }]);
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Realtime broadcasts, Edge Function calls and stills one ingest step causes on the server. */
export interface StepCost {
  /** realtime.send calls: events, state changes, the session's tile, frames, help requests. */
  broadcasts: number;
  /** ingest, plus frames when it uploads stills. */
  invocations: number;
  stills: number;
}

const STATE_CHANGING: ReadonlySet<ClientEventType> = new Set([
  "exam.started",
  "session.paused",
  "session.resumed",
]);

/**
 * From the triggers in supabase/migrations: every event is broadcast (events_broadcast), a pause, a
 * resume or a start also updates the session's state (one `session` broadcast), the call itself writes
 * last_seen_at (one more), every confirmed still is a `frame`, and a help request a `help`.
 */
export function stepCost(step: EpisodeStep): StepCost {
  const stills = step.events.reduce((sum, event) => sum + event.stills.length, 0);
  const stateChanges = step.events.filter((event) => STATE_CHANGING.has(event.type)).length;
  const help = step.events.filter((event) => event.type === "student.help_requested").length;
  return {
    broadcasts: step.events.length + stateChanges + 1 + stills + help,
    invocations: 1 + (stills > 0 ? 1 : 0),
    stills,
  };
}

export function planCost(plan: EpisodePlan): StepCost {
  return plan.steps.map(stepCost).reduce(
    (sum, cost) => ({
      broadcasts: sum.broadcasts + cost.broadcasts,
      invocations: sum.invocations + cost.invocations,
      stills: sum.stills + cost.stills,
    }),
    { broadcasts: 0, invocations: 0, stills: 0 },
  );
}

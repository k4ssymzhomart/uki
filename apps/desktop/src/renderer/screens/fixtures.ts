// Fixture view models for every Phase 0 student frame, with the values the Figma frames show
// (Mathematics 2 · Midterm, Fri 9 Oct 2026, Asia/Almaty). The screens gallery and the tests render
// them. Server data (course name, question text) comes in the student's language, as join_exam and
// the questions query return it; everything else on screen is a catalog key.
import type { Locale } from "@uki/i18n";
import type {
  EndedModel,
  ExamModel,
  Frame,
  IdentityModel,
  JoinModel,
  LogEntry,
  ModelBase,
  QuestionModel,
  RulesModel,
  ScreenModel,
  SubmittedModel,
  SystemCheckModel,
  TitleBarModel,
} from "../flow/view-model.ts";

/** Every frame, in the order of the student flow table. */
export const FRAMES: readonly Frame[] = [
  "1.1",
  "1.1a",
  "1.2",
  "1.3",
  "1.3a",
  "1.4",
  "2.1",
  "2.1a",
  "2.1c",
  "2.1e",
  "2.2",
  "2.3",
  "2.1d",
  "3.1",
];

/** The Figma node of each frame, for the gallery and the comparison notes. */
export const FIGMA_NODES: Record<Frame, string> = {
  "1.1": "51:2058",
  "1.1a": "151:11483",
  "1.2": "51:2060",
  "1.3": "51:2062",
  "1.3a": "151:11547",
  "1.4": "51:2064",
  "2.1": "51:2074",
  "2.1a": "180:18130",
  "2.1c": "180:18517",
  "2.1d": "181:16655",
  "2.1e": "199:18883",
  "2.2": "51:2076",
  "2.3": "51:2078",
  "3.1": "51:2090",
};

/** A clock time on Fri 9 Oct 2026 in Asia/Almaty (UTC+5), as epoch milliseconds. */
export function almaty(time: string): number {
  return Date.parse(`2026-10-09T${time}+05:00`);
}

const MINUTE = 60_000;
const SECOND = 1000;

const COURSE: Record<Locale, string> = { en: "Mathematics 2", kk: "Математика 2", ru: "Математика 2" };

const QUESTION_BODY: Record<Locale, string> = {
  en: "Find the derivative of f(x) = x³ − 4x + 1.",
  kk: "f(x) = x³ − 4x + 1 функциясының туындысын табыңыз.",
  ru: "Найдите производную f(x) = x³ − 4x + 1.",
};

const PROCTOR = "Aigerim S.";

function base(locale: Locale, variant: TitleBarModel["variant"], joined = true): ModelBase {
  return {
    locale,
    titleBar: { exam: joined ? { course: COURSE[locale], kind: "Midterm" } : null, variant },
    windowHidden: false,
  };
}

function question(locale: Locale): QuestionModel {
  return {
    id: "q7",
    n: 7,
    total: 20,
    body: QUESTION_BODY[locale],
    choices: [
      { id: "a", letter: "A", body: "3x² − 4" },
      { id: "b", letter: "B", body: "x² − 4x" },
      { id: "c", letter: "C", body: "3x² − 4x + 1" },
      { id: "d", letter: "D", body: "3x − 4" },
    ],
    selectedChoiceId: "a",
  };
}

const START_LOG: LogEntry[] = [
  { id: "on-screen", at: almaty("10:00:09"), kind: "on_screen", faceMatched: true },
  { id: "started", at: almaty("10:00:07"), kind: "exam_started", tabsClosed: 3 },
];

function exam(locale: Locale): ExamModel {
  return {
    ...base(locale, "locked"),
    frame: "2.1",
    mode: "app",
    question: question(locale),
    questionsLoading: false,
    questionsFailed: false,
    answeredCount: 6,
    savedAt: almaty("10:47:02"),
    savedOffline: false,
    canGoBack: true,
    isLast: false,
    submitting: false,
    watch: { state: "watching", elapsedMs: 47 * MINUTE + 36 * SECOND, phoneScore: null },
    camera: { faces: 1 },
    timer: {
      remainingMs: 42 * MINUTE + 17 * SECOND,
      totalMs: 90 * MINUTE,
      endsAt: almaty("11:30:00"),
      running: true,
      addedMinutes: null,
    },
    log: [{ id: "q6", at: almaty("10:47:02"), kind: "question_saved", n: 6 }, ...START_LOG],
    browserLocked: { tabsClosed: 3 },
    offline: null,
    phone: null,
    selfPause: null,
    proctorPause: null,
    notice: null,
    canAskProctor: true,
    help: null,
  };
}

const CARD_RECT = { x: 0.6071, y: 0.5, width: 0.3179, height: 0.2667 };

function identity(locale: Locale): IdentityModel {
  return {
    ...base(locale, "default"),
    frame: "1.3",
    step: { current: 3, total: 4 },
    rows: { face: "ok", card: "pending", person: "ok" },
    tries: 1,
    maxTries: 3,
    status: "checking",
    cardRect: CARD_RECT,
    canContinue: false,
    help: null,
  };
}

/** The fixture model of a frame in a language. */
export function fixture(frame: Frame, locale: Locale = "en"): ScreenModel {
  switch (frame) {
    case "1.1":
    case "1.1a": {
      const wrong = frame === "1.1a";
      return {
        ...base(locale, "default", false),
        frame,
        step: { n: 1, total: 4 },
        code: wrong ? "MATH2-204-TUE" : "MATH2-204-FRI",
        studentNumber: "20231187",
        busy: false,
        error: wrong ? "invalid_code" : null,
      } satisfies JoinModel;
    }
    case "1.2":
      return {
        ...base(locale, "default"),
        frame,
        step: { current: 2, total: 4 },
        camera: { status: "ready", faces: 1, problem: null },
        network: { status: "ready", ms: 38 },
        version: { status: "ready", version: "1.4.2" },
        browserLock: { status: "ready", required: true, link: "paired" },
        apps: { status: "fail", app: "Telegram" },
        screenShare: { status: "ready", app: null },
        storage: { status: "checking", freeGb: null },
        canContinue: false,
        rechecking: false,
      } satisfies SystemCheckModel;
    case "1.3":
      return identity(locale);
    case "1.3a":
      return {
        ...identity(locale),
        frame,
        rows: { face: "ok", card: "fail", person: "ok" },
        tries: 3,
        help: { requestedAt: almaty("09:52:00"), proctorName: PROCTOR },
      } satisfies IdentityModel;
    case "1.4":
      return {
        ...base(locale, "default"),
        frame,
        step: { current: 4, total: 4 },
        gazeSeconds: 2,
        agreed: true,
        startsAt: almaty("10:00:00"),
        countdownMs: 4 * MINUTE + 12 * SECOND,
        startReady: false,
        mode: "app",
      } satisfies RulesModel;
    case "2.1":
      return exam(locale);
    case "2.1a":
      return {
        ...exam(locale),
        ...base(locale, "offline"),
        frame,
        savedAt: almaty("10:52:30"),
        savedOffline: true,
        watch: { state: "offline", elapsedMs: 16 * SECOND, phoneScore: null },
        timer: { ...exam(locale).timer, remainingMs: 37 * MINUTE + 30 * SECOND },
        log: [{ id: "net", at: almaty("10:52:14"), kind: "network_lost" }, ...START_LOG],
        offline: { since: almaty("10:52:14") },
      } satisfies ExamModel;
    case "2.1c":
      return {
        ...exam(locale),
        ...base(locale, "proctor_paused"),
        frame,
        watch: { state: "proctor_paused", elapsedMs: 42 * MINUTE + 17 * SECOND, phoneScore: null },
        timer: { ...exam(locale).timer, remainingMs: 40 * MINUTE + 30 * SECOND, running: false },
        log: [
          { id: "paused", at: almaty("10:49:30"), kind: "proctor_paused", proctorName: PROCTOR },
          { id: "phone", at: almaty("10:47:10"), kind: "phone", confidence: 0.94 },
          { id: "started", at: almaty("10:00:07"), kind: "exam_started", tabsClosed: 3 },
        ],
        proctorPause: {
          proctorName: PROCTOR,
          text: "Stay in your seat. I’ll resume your exam in a minute.",
          since: almaty("10:49:30"),
          pausedMs: 75 * SECOND,
        },
        canAskProctor: false,
      } satisfies ExamModel;
    case "2.1e":
      return {
        ...exam(locale),
        frame,
        timer: {
          ...exam(locale).timer,
          remainingMs: 52 * MINUTE + 17 * SECOND,
          totalMs: 100 * MINUTE,
          endsAt: almaty("11:40:00"),
          addedMinutes: 10,
        },
        log: [
          {
            id: "added",
            at: almaty("10:31:05"),
            kind: "time_added",
            minutes: 10,
            proctorName: PROCTOR,
            endsAt: almaty("11:40:00"),
          },
          ...START_LOG,
        ],
        notice: {
          message: {
            at: almaty("10:31:00"),
            proctorName: PROCTOR,
            text: "10 more minutes for everyone because of the network drop. The exam now ends at 11:40.",
            preset: null,
          },
          timeAdded: {
            at: almaty("10:31:05"),
            proctorName: PROCTOR,
            minutes: 10,
            endsAt: almaty("11:40:00"),
          },
        },
      } satisfies ExamModel;
    case "2.2":
      return {
        ...exam(locale),
        frame,
        watch: { state: "phone", elapsedMs: 47 * MINUTE + 36 * SECOND, phoneScore: 0.94 },
        log: [{ id: "phone", at: almaty("10:47:10"), kind: "phone", confidence: 0.94 }, ...START_LOG],
        phone: { score: 0.94 },
      } satisfies ExamModel;
    case "2.3":
      return {
        ...exam(locale),
        frame,
        watch: { state: "paused", elapsedMs: 52 * MINUTE + 31 * SECOND, phoneScore: null },
        camera: { faces: 0 },
        timer: { ...exam(locale).timer, remainingMs: 37 * MINUTE + 29 * SECOND, running: false },
        log: [{ id: "no-face", at: almaty("10:52:31"), kind: "no_face" }, ...START_LOG],
        selfPause: {
          reason: "face_missing",
          since: almaty("10:52:31"),
          pausedMs: 42 * SECOND,
          canResume: true,
        },
      } satisfies ExamModel;
    case "2.1d":
      return {
        ...base(locale, "ended"),
        frame,
        proctorName: PROCTOR,
        endedAt: almaty("10:58:12"),
        receiptId: "UKI-204-0942-MT",
        answered: 14,
        total: 20,
        reason: null,
        contactEmail: "exams@kru.test",
      } satisfies EndedModel;
    case "3.1":
      return {
        ...base(locale, "submitted"),
        frame,
        receiptId: "UKI-204-0917-MT",
        submittedAt: almaty("11:28:04"),
        timeUsedMin: 87,
        totalMin: 90,
        flags: 3,
        state: "submitted",
      } satisfies SubmittedModel;
  }
}

/** Which brand stand-in picture the gallery puts in the camera slot (Figma's demo footage). */
export type CameraStandIn = "normal" | "phone" | "empty-seat" | "webcam";

export const CAMERA_STAND_IN: Partial<Record<Frame, CameraStandIn>> = {
  "1.2": "normal",
  "1.3": "normal",
  "1.3a": "normal",
  "2.1": "webcam",
  "2.1a": "webcam",
  "2.1c": "webcam",
  "2.1e": "webcam",
  "2.2": "phone",
  "2.3": "empty-seat",
};

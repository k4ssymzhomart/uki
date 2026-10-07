// Physics 1 · Quiz 3: a few single-choice kinematics questions, and the attempt kept in sessionStorage so
// a reload does not lose it. Nothing leaves the page: this is a mock LMS.
import type { PortalLocale } from "./messages.ts";

export interface Question {
  id: string;
  text: Record<PortalLocale, string>;
  choices: readonly string[];
}

/** The signed-in student the mock portal shows (Figma E.4). */
export const PORTAL_USER = { name: "Aliya Seitkali", initials: "AS" } as const;

/** Opens at 14:00 Almaty, 40 minutes, one attempt (Figma E.4). */
export const QUIZ = { opensAt: "14:00", minutes: 40, attempts: 1 } as const;

export const QUESTIONS: readonly Question[] = [
  {
    id: "q1",
    text: {
      en: "A car moves at a constant 20 m/s. How far does it go in 6 s?",
      ru: "Автомобиль движется с постоянной скоростью 20 м/с. Какой путь он пройдёт за 6 с?",
    },
    choices: ["60 m", "120 m", "200 m", "26 m"],
  },
  {
    id: "q2",
    text: {
      en: "A ball is dropped from rest. What is its speed after 2 s? Take g = 10 m/s².",
      ru: "Мяч падает из состояния покоя. Какова его скорость через 2 с? g = 10 м/с².",
    },
    choices: ["5 m/s", "10 m/s", "20 m/s", "40 m/s"],
  },
  {
    id: "q3",
    text: {
      en: "A cyclist goes from 2 m/s to 8 m/s in 3 s. What is the acceleration?",
      ru: "Велосипедист разгоняется с 2 м/с до 8 м/с за 3 с. Каково ускорение?",
    },
    choices: ["1 m/s²", "2 m/s²", "3 m/s²", "6 m/s²"],
  },
  {
    id: "q4",
    text: {
      en: "A car starts from rest and accelerates at 2 m/s². How far does it travel in 5 s?",
      ru: "Автомобиль трогается с места с ускорением 2 м/с². Какой путь он пройдёт за 5 с?",
    },
    choices: ["10 m", "25 m", "50 m", "100 m"],
  },
  {
    id: "q5",
    text: {
      en: "A stone is thrown up at 15 m/s. How long until it stops rising? Take g = 10 m/s².",
      ru: "Камень брошен вверх со скоростью 15 м/с. Через сколько он перестанет подниматься? g = 10 м/с².",
    },
    choices: ["0.5 s", "1 s", "1.5 s", "3 s"],
  },
];

export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export interface Attempt {
  startedAt: number;
  finishedAt: number | null;
  answers: Record<string, number>;
  savedAt: number | null;
}

const KEY = "kru-mock:physics-1/quiz-3";

export function newAttempt(now: number): Attempt {
  return { startedAt: now, finishedAt: null, answers: {}, savedAt: null };
}

export function answeredCount(attempt: Attempt): number {
  return QUESTIONS.filter((q) => attempt.answers[q.id] !== undefined).length;
}

export function answer(attempt: Attempt, questionId: string, choice: number, now: number): Attempt {
  return { ...attempt, answers: { ...attempt.answers, [questionId]: choice }, savedAt: now };
}

export function finish(attempt: Attempt, now: number): Attempt {
  return attempt.finishedAt === null ? { ...attempt, finishedAt: now } : attempt;
}

/** Whole minutes taken, at least 1 once finished. */
export function minutesTaken(attempt: Attempt): number {
  const end = attempt.finishedAt ?? attempt.startedAt;
  return Math.max(1, Math.round((end - attempt.startedAt) / 60_000));
}

function isAttempt(value: unknown): value is Attempt {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.startedAt === "number" && typeof v.answers === "object" && v.answers !== null;
}

export function loadAttempt(storage: Pick<Storage, "getItem">): Attempt | null {
  try {
    const raw = storage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAttempt(storage: Pick<Storage, "setItem">, attempt: Attempt): void {
  storage.setItem(KEY, JSON.stringify(attempt));
}

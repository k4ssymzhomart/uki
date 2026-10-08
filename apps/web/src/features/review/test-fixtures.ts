// Rows for the review tests: History of Kazakhstan as the seed has it (seven flags on five sessions,
// supabase/seed.sql), plus a session without flags and one already decided.
import type { CompactEvent, EventType } from "@uki/contracts";
import type { ReviewDecisionRow, ReviewExamRow, ReviewInput, ReviewSessionRow } from "./review-model.ts";

export const NOW = Date.parse("2026-10-09T09:00:00.000Z");
export const EXAM_ID = "e0000000-0000-4000-8000-000000000003";
export const OTHER_EXAM_ID = "e0000000-0000-4000-8000-000000000002";
export const REVIEWER = "c1000000-0000-4000-8000-000000000001";
export const OTHER_REVIEWER = "c1000000-0000-4000-8000-000000000002";

/** 11:00 Almaty today, 60 minutes. */
export const STARTS_AT = "2026-10-09T06:00:00.000Z";

export function at(minutes: number): string {
  return new Date(Date.parse(STARTS_AT) + minutes * 60_000).toISOString();
}

export function sessionId(seat: number): string {
  return `d0000000-0000-4000-8003-${String(seat).padStart(12, "0")}`;
}

export const EXAM: ReviewExamRow = {
  id: EXAM_ID,
  title: "History of Kazakhstan · Test",
  status: "to_review",
  starts_at: STARTS_AT,
  duration_min: 60,
};

export const LIVE_EXAM: ReviewExamRow = {
  id: OTHER_EXAM_ID,
  title: "Physics 1 · Quiz 3",
  status: "live",
  starts_at: "2026-10-09T08:30:00.000Z",
  duration_min: 40,
};

const NAMES: Record<number, string> = {
  7: "Madina Tulegenova",
  21: "Arman Bekzhanov",
  33: "Dias Kenzhebekov",
  48: "Timur Nurlanov",
  64: "Nurlan Abenov",
  90: "Zhansaya Omarova",
  100: "Aliya Serikova",
};

export function session(seat: number, overrides: Partial<ReviewSessionRow> = {}): ReviewSessionRow {
  return {
    id: sessionId(seat),
    exam_id: EXAM_ID,
    student_id: `b0000000-0000-4000-8000-${String(seat).padStart(12, "0")}`,
    state: "submitted",
    started_at: at(0),
    time_used_s: (35 + (seat % 24)) * 60,
    identity_result: "matched",
    students: {
      full_name: NAMES[seat] ?? `Student ${seat}`,
      student_number: `2023${String(seat).padStart(4, "0")}`,
    },
    ...overrides,
  };
}

let counter = 0;

export function flag(
  seat: number,
  type: EventType,
  minute: number,
  data: Record<string, unknown> = {},
  overrides: Partial<CompactEvent> = {},
): CompactEvent {
  counter += 1;
  return {
    id: `e1000000-0000-4000-8003-${String(counter).padStart(12, "0")}`,
    session_id: sessionId(seat),
    exam_id: EXAM_ID,
    type,
    source: "app",
    review: "flag",
    at: at(minute),
    received_at: new Date(Date.parse(at(minute)) + 1000).toISOString(),
    data,
    frame_count: 0,
    ...overrides,
  };
}

export function decision(seat: number, decidedAt: string, overrides: Partial<ReviewDecisionRow> = {}) {
  return {
    session_id: sessionId(seat),
    exam_id: EXAM_ID,
    decision: "no_issue",
    note: null,
    reviewer_id: REVIEWER,
    decided_at: decidedAt,
    ...overrides,
  } satisfies ReviewDecisionRow;
}

/**
 * The seed's seven flags: seat 7 phone and look-away, 21 second face, 33 phone, 48 tab and look-down, 64
 * camera. Three carry a still here (the seed's have none until seed v2).
 */
export function historyFlags(): CompactEvent[] {
  return [
    flag(7, "phone.detected", 12, { score: 0.94, held_ms: 6000 }, { frame_count: 1 }),
    flag(7, "gaze.off_screen", 18, { duration_ms: 4200, direction: "left" }, { frame_count: 1 }),
    flag(21, "face.second", 22, { duration_ms: 4000, faces: 2 }),
    flag(33, "phone.detected", 31, { score: 0.91, held_ms: 2400 }),
    flag(48, "tab.blocked", 26, { app: "Telegram" }),
    flag(48, "gaze.down", 40, { duration_ms: 3100 }, { frame_count: 1 }),
    flag(64, "camera.lost", 44, { reason: "ended" }),
  ];
}

export function historyInput(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    exams: [EXAM],
    sessions: [7, 21, 33, 48, 64, 90].map((seat) => session(seat)),
    flags: historyFlags(),
    decisions: [],
    ...overrides,
  };
}

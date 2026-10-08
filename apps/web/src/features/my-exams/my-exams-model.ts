import { ExamChecks, ExamStatus, Locale, Timestamp, toMs, Uuid } from "@uki/contracts";
import type { ChipStatus } from "@uki/ui";
import { z } from "zod";
import { almatyDay, isSameAlmatyDay } from "../../lib/format.ts";
import { almatyWeekDays } from "../overview/overview-model.ts";

/**
 * 0.9 My exams and 0.9a Confirm seats as pure functions over the proctor's own `proctor_assignments`
 * rows with their exams: which rows the table lists, each row's chip, the banner, the four stat cards
 * and the numbers in 0.9a's sentence. Unit-tested in my-exams-model.test.ts.
 */

const SeatNumber = z.number().int().positive();

/** One of the signed-in proctor's assignments, as my-exams-data.ts reads it under RLS. */
export const MyAssignmentRow = z.object({
  exam_id: Uuid,
  seat_from: SeatNumber.nullable(),
  seat_to: SeatNumber.nullable(),
  languages: z.array(Locale),
  is_lead: z.boolean(),
  confirmed_at: Timestamp.nullable(),
  change_request: z.string().nullable(),
  exam: z.object({
    id: Uuid,
    title: z.string(),
    course: z.string(),
    status: ExamStatus,
    starts_at: Timestamp,
    duration_min: z.number().int().positive(),
    lobby_opens_at: Timestamp,
    checks: ExamChecks,
    /** The exam office member who made the exam: "Dana Akhmetova assigned you…". */
    creator: z.object({ full_name: z.string() }).nullable(),
  }),
});
export type MyAssignmentRow = z.infer<typeof MyAssignmentRow>;

/** The select for MyAssignmentRow; `staff!exams_created_by_fkey` names the creator among two paths. */
export const MY_ASSIGNMENT_COLUMNS =
  "exam_id, seat_from, seat_to, languages, is_lead, confirmed_at, change_request, exam:exams(id, title, course, status, starts_at, duration_min, lobby_opens_at, checks, creator:staff!exams_created_by_fkey(full_name))";

/** An assignment with the number of roster students in its seats (the whole roster without seats). */
export type MyExam = MyAssignmentRow & { students: number };

export type SeatRange = { from: number; to: number };

/** The assignment's seats, or null when it covers every seat (Physics 1's single proctor). */
export function seatRange(row: Pick<MyAssignmentRow, "seat_from" | "seat_to">): SeatRange | null {
  return row.seat_from !== null && row.seat_to !== null ? { from: row.seat_from, to: row.seat_to } : null;
}

/** What the row's chip says: confirmed, waiting for the proctor, waiting for the exam office, or live. */
export type AssignmentState = "confirmed" | "toConfirm" | "changeRequested" | "live";

export function assignmentState(row: MyAssignmentRow): AssignmentState {
  if (row.exam.status === "live") return "live";
  if (row.confirmed_at !== null) return "confirmed";
  return row.change_request !== null ? "changeRequested" : "toConfirm";
}

/** 0.9's chip: Confirmed (ok), Confirm seats (warn), Change requested (warn), Live (ok). */
export const STATE_CHIP: Record<AssignmentState, ChipStatus> = {
  confirmed: "ok",
  toConfirm: "warn",
  changeRequested: "warn",
  live: "ok",
};

/** Opening 0.9a from the chip: every scheduled assignment that is not confirmed yet. */
export function canConfirm(row: MyAssignmentRow): boolean {
  return row.exam.status === "scheduled" && row.confirmed_at === null;
}

/**
 * The rows 0.9 lists: exams that are live or scheduled, live first, then by start. Drafts can still
 * change and finished exams are on the overview's Done tab, so neither is listed.
 */
export function listedExams<T extends MyAssignmentRow>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.exam.status === "live" || row.exam.status === "scheduled")
    .sort(
      (a, b) =>
        Number(b.exam.status === "live") - Number(a.exam.status === "live") ||
        toMs(a.exam.starts_at) - toMs(b.exam.starts_at),
    );
}

/** The banner's assignment: the soonest scheduled one the proctor has neither confirmed nor questioned. */
export function bannerExam<T extends MyAssignmentRow>(rows: readonly T[]): T | null {
  return listedExams(rows).find((row) => assignmentState(row) === "toConfirm") ?? null;
}

/** How NEXT EXAM reads: "Today 14:00", "Fri 10:00" within six days, else the date. */
export type NextLabel = { kind: "today" | "weekday" | "date"; atMs: number };

const DAY_MS = 86_400_000;

export function nextLabel(startsAt: string, nowMs: number): NextLabel {
  const atMs = toMs(startsAt);
  if (isSameAlmatyDay(atMs, nowMs)) return { kind: "today", atMs };
  return { kind: atMs - nowMs < 6 * DAY_MS ? "weekday" : "date", atMs };
}

/** The Asia/Almaty days of this Monday-to-Sunday week and the next one. */
export function thisWeekAndNext(nowMs: number): Set<string> {
  return new Set([...almatyWeekDays(nowMs), ...almatyWeekDays(nowMs + 7 * DAY_MS)]);
}

export type MyExamStats<T extends MyAssignmentRow> = {
  /** The live exam, else the soonest scheduled one. */
  next: T | null;
  /** Listed exams that start this week or next ("3 exams · this week and next"). */
  assigned: number;
  /** Students in the seats of those exams ("146 · across your seats"). */
  students: number;
  /** Scheduled assignments still to confirm, and the soonest of them for the caption. */
  toConfirm: { count: number; first: T | null };
};

export function myExamStats<T extends MyExam>(rows: readonly T[], nowMs: number): MyExamStats<T> {
  const listed = listedExams(rows);
  const weeks = thisWeekAndNext(nowMs);
  const soon = listed.filter((row) => weeks.has(almatyDay(row.exam.starts_at)));
  const pending = listed.filter((row) => assignmentState(row) === "toConfirm");
  return {
    next: listed[0] ?? null,
    assigned: soon.length,
    students: soon.reduce((sum, row) => sum + row.students, 0),
    toConfirm: { count: pending.length, first: pending[0] ?? null },
  };
}

/** When the exam ends, for 0.9a's "10:00–11:30". */
export function endsAtMs(row: MyAssignmentRow): number {
  return toMs(row.exam.starts_at) + row.exam.duration_min * 60_000;
}

/** Arguments of `rpc('confirm_seats')` from 0.9a: nothing but the exam confirms, text asks for a change. */
export function confirmSeatsArgs(
  examId: string,
  changeRequest?: string,
): { exam_id: string; change_request?: string } {
  const text = changeRequest?.trim() ?? "";
  return text === "" ? { exam_id: examId } : { exam_id: examId, change_request: text };
}

/** The row after confirm_seats answered: its confirmation and change request from the reply. */
export function applyConfirmation<T extends MyAssignmentRow>(
  rows: readonly T[],
  reply: { exam_id: string; confirmed_at: string | null; change_request: string | null },
): T[] {
  return rows.map((row) =>
    row.exam_id === reply.exam_id
      ? { ...row, confirmed_at: reply.confirmed_at, change_request: reply.change_request }
      : row,
  );
}

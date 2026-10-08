"use server";

import {
  AssignProctorsInput,
  AssignProctorsOutput,
  type ExamDraft,
  ImportRosterInput,
  ImportRosterOutput,
  type ProctorAssignment,
  SaveExamDraftInput,
  ScheduleExamInput,
  ScheduleExamOutput,
  type ScheduleProblem,
  type SeatRangeProblem,
  type WizardStep,
} from "@uki/contracts";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { SendInvitesInput, SendInvitesOutput } from "./send-invites.ts";
import {
  examDraftFromRow,
  FixInviteEmailInput,
  parseSeatError,
  SEND_INVITES_READY,
  scheduleFailure,
  stepHref,
} from "./wizard-model.ts";

/**
 * The wizard's writes, as the signed-in exam office member under RLS: save_exam_draft from every
 * step, import_roster and assign_proctors from 0.3, the invite address from 0.3b, schedule_exam and the
 * test invite from 0.5. Every input is checked with the contracts' Zod schemas before it leaves and
 * every reply after it arrives; a failure comes back as a code the page translates.
 */

export type WizardError = "forbidden" | "notDraft" | "invalid" | "failed";

async function officeOnly(): Promise<boolean> {
  const staff = await requireStaff();
  return staff !== null && (staff.role === "exam_office" || staff.role === "admin");
}

function codeOf(error: { message?: string } | null): WizardError {
  const message = error?.message ?? "";
  if (message === "forbidden") return "forbidden";
  if (message === "not_draft" || message === "not_editable") return "notDraft";
  if (message === "bad_request") return "invalid";
  return "failed";
}

/** 0.1's New exam and /exams/new: a new draft from the workspace's defaults, then its first step. */
export async function createExamDraft(): Promise<{ error: WizardError }> {
  if (!(await officeOnly())) return { error: "forbidden" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_exam_draft", { exam: {} });
  if (error) return { error: codeOf(error) };
  const exam = examDraftFromRow(data);
  if (!exam) return { error: "failed" };
  redirect(stepHref(exam.id, "details"));
}

export type SaveDraftResult =
  | { ok: true; exam: ExamDraft; savedAt: string }
  | { ok: false; error: WizardError };

/** Any step's fields into the draft (save_exam_draft); the reply is the whole exam. */
export async function saveExamDraft(input: unknown): Promise<SaveDraftResult> {
  try {
    if (!(await officeOnly())) return { ok: false, error: "forbidden" };
    const parsed = SaveExamDraftInput.safeParse(input);
    if (!parsed.success || parsed.data.exam.id === undefined) return { ok: false, error: "invalid" };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("save_exam_draft", { exam: parsed.data.exam });
    if (error) return { ok: false, error: codeOf(error) };
    const exam = examDraftFromRow(data);
    return exam ? { ok: true, exam, savedAt: new Date().toISOString() } : { ok: false, error: "failed" };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed" };
  }
}

export type ImportRosterResult =
  | { ok: true; result: ImportRosterOutput }
  | { ok: false; error: WizardError; row?: number };

/** 0.3: the checked rows of the file (import_roster replaces the roster; importing twice adds nobody). */
export async function importRoster(input: unknown): Promise<ImportRosterResult> {
  try {
    if (!(await officeOnly())) return { ok: false, error: "forbidden" };
    const parsed = ImportRosterInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("import_roster", {
      exam_id: parsed.data.exam_id,
      rows: parsed.data.rows,
    });
    if (error) {
      const row = /^row (\d+)/.exec(error.details ?? "");
      return { ok: false, error: codeOf(error), ...(row ? { row: Number(row[1]) } : {}) };
    }
    const result = ImportRosterOutput.safeParse(data);
    return result.success ? { ok: true, result: result.data } : { ok: false, error: "failed" };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed" };
  }
}

export type AssignProctorsResult =
  | { ok: true; assignments: ProctorAssignment[] }
  | { ok: false; error: WizardError }
  | { ok: false; error: "seats"; seats: SeatRangeProblem };

/** 0.3's proctors table (assign_proctors replaces it; a gap or an overlap is refused). */
export async function assignProctors(input: unknown): Promise<AssignProctorsResult> {
  try {
    if (!(await officeOnly())) return { ok: false, error: "forbidden" };
    const parsed = AssignProctorsInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("assign_proctors", {
      exam_id: parsed.data.exam_id,
      rows: parsed.data.rows,
    });
    if (error) {
      const seats = parseSeatError(error);
      return seats ? { ok: false, error: "seats", seats } : { ok: false, error: codeOf(error) };
    }
    const result = AssignProctorsOutput.safeParse(data);
    return result.success ? { ok: true, assignments: result.data } : { ok: false, error: "failed" };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed" };
  }
}

/**
 * 0.3b: a new address for one student's invite. The invite goes back to `pending` (the trigger keeps
 * exam_students.invite_status in step); "Also fix it in the roster" writes it to the student too, for
 * later exams. Once send-invites exists, a scheduled exam's invite is sent again to the new address.
 */
export async function fixInviteEmail(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: WizardError }> {
  try {
    if (!(await officeOnly())) return { ok: false, error: "forbidden" };
    const parsed = FixInviteEmailInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { exam_id, student_id, email, roster } = parsed.data;
    const supabase = await createSupabaseServerClient();
    const invite = await supabase
      .from("invites")
      .update({ email, state: "pending", error: null, provider_id: null, sent_at: null })
      .eq("exam_id", exam_id)
      .eq("student_id", student_id)
      .select("id");
    if (invite.error) return { ok: false, error: codeOf(invite.error) };
    if ((invite.data ?? []).length === 0) return { ok: false, error: "forbidden" };
    if (roster) {
      const student = await supabase.from("students").update({ email }).eq("id", student_id);
      if (student.error) return { ok: false, error: codeOf(student.error) };
    }
    if (SEND_INVITES_READY) {
      const exam = await supabase.from("exams").select("status").eq("id", exam_id).maybeSingle();
      if (exam.data?.status === "scheduled") {
        await callSendInvites({ exam_id, student_ids: [student_id] });
      }
    }
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed" };
  }
}

export type ScheduleResult =
  | { ok: false; problem: ScheduleProblem; step: WizardStep }
  | { ok: false; error: WizardError };

/**
 * 0.5's Schedule exam: schedule_exam checks every step and makes the code. On success the invites go
 * out (once send-invites exists) and the exam office returns to 0.1, which shows the code. A problem
 * comes back with the step that fixes it.
 */
export async function scheduleExam(input: unknown): Promise<ScheduleResult> {
  let code: string;
  try {
    if (!(await officeOnly())) return { ok: false, error: "forbidden" };
    const parsed = ScheduleExamInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("schedule_exam", { exam_id: parsed.data.exam_id });
    if (error) {
      const failure = scheduleFailure(error);
      return failure ? { ok: false, ...failure } : { ok: false, error: codeOf(error) };
    }
    const result = ScheduleExamOutput.safeParse(data);
    if (!result.success) return { ok: false, error: "failed" };
    code = result.data.code;
    if (SEND_INVITES_READY) await callSendInvites({ exam_id: parsed.data.exam_id });
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed" };
  }
  redirect(`/overview?scheduled=${encodeURIComponent(code)}`);
}

export type TestInviteResult = { ok: true; sent: number } | { ok: false; error: WizardError | "unavailable" };

/** 0.5's Send a test invite to me: send-invites with `test: true`, which mails the signed-in staff member. */
export async function sendTestInvite(input: unknown): Promise<TestInviteResult> {
  try {
    if (!(await officeOnly())) return { ok: false, error: "forbidden" };
    const parsed = ScheduleExamInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    if (!SEND_INVITES_READY) return { ok: false, error: "unavailable" };
    const reply = await callSendInvites({ exam_id: parsed.data.exam_id, test: true });
    return reply ? { ok: true, sent: reply.sent } : { ok: false, error: "failed" };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed" };
  }
}

/** The send-invites Edge Function (WP 1.4) as the signed-in staff member; null when it failed. */
async function callSendInvites(body: SendInvitesInput): Promise<SendInvitesOutput | null> {
  const request = SendInvitesInput.safeParse(body);
  if (!request.success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke("send-invites", { body: request.data });
  if (error) return null;
  const reply = SendInvitesOutput.safeParse(data);
  return reply.success ? reply.data : null;
}

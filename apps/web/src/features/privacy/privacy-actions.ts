"use server";

import {
  DATA_REQUEST_REPLY_MAX,
  DataRequestActionInput,
  DataRequestActionOutput,
  type DataRequestDeleted,
  DataRequestKind,
  Uuid,
} from "@uki/contracts";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { auditRead } from "../students/students-data.ts";
import { type ActionError, actionError } from "./privacy-model.ts";

const ActInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("copy") }),
  z.object({ action: z.literal("reply"), reply: z.string().trim().min(1).max(DATA_REQUEST_REPLY_MAX) }),
]);

/**
 * What a drawer asks for: an action on an existing request, or on a new one from A.3, which is saved
 * first (PostgREST under RLS; its trigger writes the `data_request.received` audit row).
 */
const RequestAction = z.intersection(
  z.union([z.object({ requestId: Uuid }), z.object({ studentId: Uuid, kind: DataRequestKind })]),
  ActInput,
);
export type RequestAction = z.input<typeof RequestAction>;

export type RequestActionResult =
  | {
      ok: true;
      requestId: string;
      /** The copy's 7-day link, shown once. */
      link: { url: string; expires_at: string } | null;
      deleted: DataRequestDeleted | null;
    }
  | { ok: false; error: ActionError; requestId: string | null };

const ErrorBody = z.object({ error: z.string(), message: z.string().optional() });

/** The `{ error, message }` body of a refused call to an Edge Function, from supabase-js's error. */
async function refusal(error: unknown): Promise<{ code: string | null; message: string | null }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = ErrorBody.safeParse(await context.json());
      if (body.success) return { code: body.data.error, message: body.data.message ?? null };
    } catch {
      // not JSON
    }
  }
  return { code: null, message: null };
}

/**
 * A.5a's Delete, A.5b's link and either drawer's reply: calls the data-request Edge Function as the
 * signed-in staff member, which checks that they are the exam office of the request's workspace, does
 * the work and writes the audit row. The function's input and reply are checked with the contracts.
 */
export async function actOnRequest(input: unknown): Promise<RequestActionResult> {
  let requestId: string | null = null;
  try {
    const staff = await requireStaff();
    if (!staff) return { ok: false, error: "failed", requestId };
    if (staff.role !== "exam_office" && staff.role !== "admin") {
      return { ok: false, error: "forbidden", requestId };
    }
    const parsed = RequestAction.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", requestId };
    const supabase = await createSupabaseServerClient();

    if ("requestId" in parsed.data) {
      requestId = parsed.data.requestId;
    } else {
      const student = await supabase
        .from("students")
        .select("workspace_id")
        .eq("id", parsed.data.studentId)
        .maybeSingle();
      const workspaceId = z.object({ workspace_id: Uuid }).safeParse(student.data);
      if (student.error || !workspaceId.success) return { ok: false, error: "forbidden", requestId };
      const created = await supabase
        .from("data_requests")
        .insert({
          workspace_id: workspaceId.data.workspace_id,
          student_id: parsed.data.studentId,
          kind: parsed.data.kind,
        })
        .select("id")
        .single();
      const id = z.object({ id: Uuid }).safeParse(created.data);
      if (created.error || !id.success) return { ok: false, error: "failed", requestId };
      requestId = id.data.id;
    }

    const body = DataRequestActionInput.parse(
      parsed.data.action === "reply"
        ? { request_id: requestId, action: "reply", reply: parsed.data.reply }
        : { request_id: requestId, action: parsed.data.action },
    );
    const { data, error } = await supabase.functions.invoke("data-request", { body });
    if (error) {
      const { code, message } = await refusal(error);
      return { ok: false, error: actionError(code, message), requestId };
    }
    const reply = DataRequestActionOutput.safeParse(data);
    if (!reply.success) return { ok: false, error: "failed", requestId };
    return {
      ok: true,
      requestId: reply.data.request.id,
      link:
        reply.data.link === null
          ? null
          : { url: reply.data.link.url, expires_at: reply.data.link.expires_at },
      deleted: reply.data.deleted,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "failed", requestId };
  }
}

/** A.6's Export CSV reads nothing new, but it takes the log out of Üki: one `audit.export` row first. */
export async function recordAuditExport(): Promise<{ ok: boolean }> {
  try {
    const staff = await requireStaff();
    if (!staff || (staff.role !== "exam_office" && staff.role !== "admin")) return { ok: false };
    await auditRead(await createSupabaseServerClient(), { action: "audit.export", object_type: "workspace" });
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false };
  }
}

"use server";

import { Uuid, WorkspaceSettings } from "@uki/contracts";
import { z } from "zod";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { WorkspaceSettingsRow } from "./settings-data.ts";

const SaveSettingsInput = z.object({ workspaceId: Uuid, settings: WorkspaceSettings });

/** Why a save failed; each maps to dashboard.settings.error.<code>. */
export type SaveSettingsError = "forbidden" | "invalid" | "failed";

export type SaveSettingsResult =
  | { ok: true; settings: WorkspaceSettings }
  | { ok: false; error: SaveSettingsError };

/**
 * A.4 saves `workspaces.settings` through PostgREST as the signed-in staff member (plan, API: settings
 * for the exam office of the workspace only). The column grant and the `workspaces_update_office` policy
 * let only the exam office and admins of that workspace write it, and the CHECK constraint refuses
 * settings WorkspaceSettings would refuse; the `workspaces_settings_audit` trigger writes the audit row.
 * save_exam_draft reads the new defaults when it makes the next exam.
 */
export async function saveWorkspaceSettings(input: unknown): Promise<SaveSettingsResult> {
  const staff = await requireStaff();
  if (!staff) return { ok: false, error: "failed" };
  if (staff.role !== "exam_office" && staff.role !== "admin") return { ok: false, error: "forbidden" };
  const parsed = SaveSettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workspaces")
    .update({ settings: parsed.data.settings })
    .eq("id", parsed.data.workspaceId)
    .select("id, settings")
    .maybeSingle();
  if (error) return { ok: false, error: error.code === "23514" ? "invalid" : "failed" };
  // No row back: RLS hid the workspace, so the caller may not change it.
  if (data === null) return { ok: false, error: "forbidden" };
  const saved = WorkspaceSettingsRow.safeParse(data);
  return saved.success ? { ok: true, settings: saved.data.settings } : { ok: false, error: "failed" };
}

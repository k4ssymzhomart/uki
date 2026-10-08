import { Uuid, WorkspaceSettings } from "@uki/contracts";
import { z } from "zod";
import type { AnyClient } from "../wall/queries.ts";

/** The staff member's workspace with its settings (A.4); RLS shows staff only their own workspace. */
export const WorkspaceSettingsRow = z.object({ id: Uuid, settings: WorkspaceSettings });
export type WorkspaceSettingsRow = z.infer<typeof WorkspaceSettingsRow>;

/** Reads the workspace's `settings`; throws when the read fails or the row does not parse. */
export async function loadWorkspaceSettings(client: AnyClient): Promise<WorkspaceSettingsRow> {
  const { data, error } = await client.from("workspaces").select("id, settings").limit(1).maybeSingle();
  if (error) throw new Error(`workspaces: ${error.message}`);
  return WorkspaceSettingsRow.parse(data);
}

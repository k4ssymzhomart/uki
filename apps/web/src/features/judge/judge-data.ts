// Judge mode: whether the wall's exam is DEMO-LIVE, read under the caller's RLS on the server render.
import { DEMO_LIVE_CODE } from "@uki/contracts";
import { z } from "zod";
import type { AnyClient } from "../wall/queries.ts";

const DemoExamRow = z.object({ id: z.uuid(), code: z.string().nullable(), starts_at: z.string() });

export interface DemoLiveWall {
  examId: string;
  startsAt: string;
}

/** DEMO-LIVE's id and starts_at when `examId` is DEMO-LIVE; null for any other exam or on an error. */
export async function loadDemoLive(client: AnyClient, examId: string): Promise<DemoLiveWall | null> {
  const { data, error } = await client
    .from("exams")
    .select("id, code, starts_at")
    .eq("id", examId)
    .eq("code", DEMO_LIVE_CODE)
    .maybeSingle();
  if (error || data === null) return null;
  const row = DemoExamRow.safeParse(data);
  return row.success ? { examId: row.data.id, startsAt: row.data.starts_at } : null;
}

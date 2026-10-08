import { z } from "zod";
import type { SupabaseBrowserClient } from "../../lib/supabase/browser.ts";

/**
 * 0.1b, "Why 0 MB?": what the server keeps for the exams on the overview. Video is always 0 MB, since
 * it never leaves the laptops; the stills in `frames` and the rows in `events` are counted under the
 * staff member's RLS, for the exams the overview shows (the chosen faculty's, or all of them).
 */
export const DataKept = z.object({
  frames: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
});
export type DataKept = z.infer<typeof DataKept>;

/** PostgREST puts the exam ids into the URL; this many stay well under any URL limit. */
const IDS_PER_REQUEST = 100;

type CountAnswer = { count: number | null; error: { message: string } | null };

async function countRows(
  supabase: SupabaseBrowserClient,
  table: "frames" | "events",
  examIds: readonly string[],
): Promise<number> {
  let total = 0;
  for (let index = 0; index < examIds.length; index += IDS_PER_REQUEST) {
    const ids = examIds.slice(index, index + IDS_PER_REQUEST);
    const { count, error }: CountAnswer = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("exam_id", ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

/** Counts the stills and the events of these exams; no exams, no requests. */
export async function loadDataKept(
  supabase: SupabaseBrowserClient,
  examIds: readonly string[],
): Promise<DataKept> {
  if (examIds.length === 0) return { frames: 0, events: 0 };
  const [frames, events] = await Promise.all([
    countRows(supabase, "frames", examIds),
    countRows(supabase, "events", examIds),
  ]);
  return DataKept.parse({ frames, events });
}

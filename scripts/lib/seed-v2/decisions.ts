// The Autumn 2026 term's review decisions (term.ts). supabase/seed.sql writes the term's exams, sessions
// and flags, but a decision names its reviewer, a staff row that exists only once `pnpm seed:staff` has
// made the accounts: so seed:staff writes the decisions after a fresh `supabase db reset`, and
// `pnpm demo:reset` writes them with the rest of the term. Upserts by session, so running it twice
// changes nothing.
import type { TablesInsert } from "../../../packages/db/src/index.ts";
import type { UkiClient } from "../supabase.ts";
import { inChunks } from "./clear.ts";
import type { Reviewer, TermPlan } from "./term.ts";

/** The four seeded staff accounts by first name, as scripts/seed-staff.ts makes them. */
export const REVIEWER_EMAIL: Readonly<Record<Reviewer, string>> = {
  dana: "dana.akhmetova@kru.test",
  aigerim: "aigerim.sadykova@kru.test",
  nurlan: "nurlan.bekov@kru.test",
  gulnara: "gulnara.kassenova@kru.test",
};

/** The term's decisions as rows, with each reviewer's staff id. */
export function termDecisionRows(
  plan: TermPlan,
  staff: Readonly<Record<Reviewer, string>>,
): TablesInsert<"review_decisions">[] {
  return plan.decisions.map((decision) => ({
    session_id: decision.sessionId,
    exam_id: decision.examId,
    decision: decision.decision,
    note: decision.note,
    reviewer_id: staff[decision.reviewer],
    decided_at: decision.decidedAt,
  }));
}

export type TermDecisionsResult =
  | { written: number }
  | { skipped: "no term" | "term differs"; sessions: number; expected: number };

/**
 * Upserts the term's decisions when the database holds the term's sessions (a database seeded before
 * seed v2 has none: nothing is written). Never deletes a decision.
 */
export async function writeTermDecisions(
  client: UkiClient,
  plan: TermPlan,
  staff: Readonly<Record<Reviewer, string>>,
): Promise<TermDecisionsResult> {
  const examIds = plan.exams.map((exam) => exam.id);
  const { count, error } = await client
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .in("exam_id", examIds);
  if (error) throw new Error(`counting the term's sessions: ${error.message}`);
  const sessions = count ?? 0;
  if (sessions === 0) return { skipped: "no term", sessions, expected: plan.sessions.length };
  if (sessions !== plan.sessions.length) {
    return { skipped: "term differs", sessions, expected: plan.sessions.length };
  }
  const rows = termDecisionRows(plan, staff);
  await inChunks(rows, 500, async (chunk) => {
    const result = await client.from("review_decisions").upsert(chunk, { onConflict: "session_id" });
    if (result.error) throw new Error(`writing the term's decisions: ${result.error.message}`);
  });
  return { written: rows.length };
}

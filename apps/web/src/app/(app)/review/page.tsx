import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadReviewQueue } from "../../../features/review/review-data.ts";
import { parseFlagParam } from "../../../features/review/review-model.ts";
import { ReviewQueueView } from "../../../features/review/review-queue-view.tsx";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.review");
  return { title: t("title") };
}

/**
 * 3.2 Review queue (Figma 51:2092) with 3.2a (`?flag=`) and 3.2b, for the exam office and proctors,
 * rendered on the server under RLS: a proctor sees only the exams assigned to it. Each exam shown writes
 * an audit row (`review.queue_viewed`).
 */
export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  if (!(await requireStaff())) return <StaffLookupFailed />;
  const { flag } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const nowMs = Date.now();
  const groups = await loadReviewQueue(supabase, nowMs);
  return <ReviewQueueView groups={groups} initialFlags={parseFlagParam(flag)} nowMs={nowMs} />;
}

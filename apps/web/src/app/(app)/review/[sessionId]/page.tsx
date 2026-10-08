import { Uuid } from "@uki/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadSessionReview } from "../../../../features/review/review-data.ts";
import { SessionReviewView } from "../../../../features/review/session-review-view.tsx";
import { StaffLookupFailed } from "../../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.review");
  return { title: t("title") };
}

/**
 * 3.3 Session review (Figma 51:2094) for the exam's proctors and its exam office, rendered on the server
 * under RLS; a session the staff member may not see is a 404. Opening it writes an audit row
 * (`review.session_viewed`); its stills come from the `stills` function, which audits each one.
 */
export default async function SessionReviewPage({ params }: PageProps<"/review/[sessionId]">) {
  if (!(await requireStaff())) return <StaffLookupFailed />;
  const { sessionId } = await params;
  if (!Uuid.safeParse(sessionId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const data = await loadSessionReview(supabase, sessionId, Date.now());
  if (data === null) notFound();
  return <SessionReviewView key={sessionId} {...data} />;
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { findDemoLiveExam } from "../../../../features/demo/demo-live-data.ts";
import { DemoLiveNotice } from "../../../../features/demo/demo-live-notice.tsx";
import { DEMO_LIVE_SIGN_IN, liveWallPath } from "../../../../features/demo/demo-model.ts";
import { getStaffMember } from "../../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.landing.meta.demoLive");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/demo/live` (the judge path, a user request of 9 October; no Figma frame): the Live demo button's
 * destination after sign-in. A visitor without a staff session goes to sign-in, which comes back here;
 * a signed-in staff member goes to the live wall of DEMO-LIVE, found by its code under their own RLS.
 * When the exam does not exist yet (or this account cannot see it) the page is a 404 that says so; when
 * the lookup gets no answer it says that instead, with Try again.
 */
export default async function DemoLivePage() {
  const lookup = await getStaffMember();
  if (lookup.status === "none") redirect(DEMO_LIVE_SIGN_IN);
  if (lookup.status === "failed") return <DemoLiveNotice kind="failed" />;
  const exam = await findDemoLiveExam(await createSupabaseServerClient());
  if (exam.status === "found") redirect(liveWallPath(exam.examId));
  if (exam.status === "failed") return <DemoLiveNotice kind="failed" />;
  notFound();
}

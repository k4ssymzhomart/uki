import { Uuid } from "@uki/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LiveWall } from "../../../../../features/wall/live-wall.tsx";
import { loadWall } from "../../../../../features/wall/load-wall.ts";
import { requireStaff } from "../../../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.wall");
  return { title: t("title") };
}

/**
 * 2.4 Live wall (Figma 51:2080) with 2.4a, 2.4b, 2.4c, 2.4e and the 2.5 drawer at ?session=<id>, for
 * proctors of the exam and the exam office. Rendered on the server with the exam's sessions, its
 * flag and log events from the last 60 minutes and its older phone and second-face flags under RLS;
 * an exam the staff member may not see is a 404. Realtime takes over in the browser.
 */
export default async function LiveWallPage({ params }: PageProps<"/exams/[examId]/live">) {
  await requireStaff();
  const { examId } = await params;
  if (!Uuid.safeParse(examId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const initial = await loadWall(supabase, examId, Date.now());
  if (initial === null) notFound();
  return <LiveWall initial={initial} />;
}

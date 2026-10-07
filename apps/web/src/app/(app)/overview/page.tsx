import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  loadBouncedInvites,
  loadGroupCount,
  loadOverviewRows,
} from "../../../features/overview/overview-data.ts";
import { overviewStats } from "../../../features/overview/overview-model.ts";
import { OverviewView } from "../../../features/overview/overview-view.tsx";
import { requireStaff } from "../../../lib/auth.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.overview");
  return { title: t("title") };
}

/**
 * 0.1 Overview (Figma 51:2046), rendered on the server as the staff member under RLS: the exam office
 * sees its workspace's exams, a proctor only the exams assigned to it.
 */
export default async function OverviewPage() {
  await requireStaff();
  const [rows, groupCount] = await Promise.all([loadOverviewRows(), loadGroupCount()]);
  const next = overviewStats(rows).upcoming.next;
  const bounced = next ? await loadBouncedInvites(next.id) : 0;
  return (
    <OverviewView
      rows={rows}
      groupCount={groupCount}
      readiness={next ? { ready: Math.max(0, next.roster_size - bounced), total: next.roster_size } : null}
      nowMs={Date.now()}
    />
  );
}

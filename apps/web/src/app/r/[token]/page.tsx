import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadSharedReport } from "../../../features/report/report-data.ts";
import { SharedReportView } from "../../../features/report/shared-report-view.tsx";

/** No index, no follow, no referrer (next.config.ts sends the same as headers, with no-store). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.report");
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * 3.5 Committee · Shared report (Figma 162:13464), public: no staff session, never requireStaff. The
 * report comes only from the shared-report Edge Function, which checks the token's hash and expiry and
 * writes one audit row per view; an unknown, revoked or expired token gets the not-found page.
 */
export default async function SharedReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const result = await loadSharedReport(token);
  if (!result.ok) notFound();
  return <SharedReportView report={result.report} />;
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { clientHash, clientIp, verifyReport } from "../../../features/report/report-data.ts";
import { VerifyView } from "../../../features/report/verify-view.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.report");
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * /verify/[code], public: verify_report says whether the printed code belongs to a report whose content
 * has not changed since the code was issued. No staff session; the code is the only input, and the
 * SHA-256 of the visitor's address counts the lookups (10 a minute, then the try-again state).
 */
export default async function VerifyPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  let decoded = code;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    // A stray "%" is just part of what was typed; verify_report refuses it as not found.
  }
  const result = await verifyReport(decoded, clientHash(clientIp(await headers())));
  return <VerifyView code={decoded} result={result} />;
}

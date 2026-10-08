import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { landingLocale } from "../../../features/landing/landing-model.ts";
import { requestPilot } from "../../../features/landing/pilot-action.ts";
import { pilotMonths } from "../../../features/landing/pilot-model.ts";
import { PilotBand, PilotPlan } from "../../../features/landing/pilot-parts.tsx";
import { PilotScreen } from "../../../features/landing/pilot-screen.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.landing.meta.pilot");
  return { title: t("title") };
}

/**
 * `/pilot`: Book a pilot (Figma 194:4014) and Sent (195:4090). Public, no session: the form calls
 * request_pilot as an anonymous visitor through its server action.
 */
export default async function PilotPage() {
  // Rendered per request: When lists the months from today, and the page follows the language cookie.
  await connection();
  const locale = landingLocale(await getLocale());
  return (
    <PilotScreen
      band={<PilotBand locale={locale} />}
      sentBand={<PilotBand locale={locale} sent />}
      plan={<PilotPlan />}
      months={pilotMonths(new Date())}
      action={requestPilot}
    />
  );
}

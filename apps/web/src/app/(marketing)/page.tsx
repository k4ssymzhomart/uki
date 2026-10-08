import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CtaBand } from "../../features/landing/cta-band.tsx";
import { Faq } from "../../features/landing/faq.tsx";
import { Features } from "../../features/landing/features.tsx";
import { FlagNotFail } from "../../features/landing/flag-not-fail.tsx";
import { Hero } from "../../features/landing/hero.tsx";
import { HowItWorks } from "../../features/landing/how-it-works.tsx";
import { homeRedirect, landingLocale } from "../../features/landing/landing-model.ts";
import { Pillars } from "../../features/landing/pillars.tsx";
import { PrivacyBand } from "../../features/landing/privacy-band.tsx";
import { ProofStrip } from "../../features/landing/proof-strip.tsx";
import { Universities } from "../../features/landing/universities.tsx";
import { getStaffMember } from "../../lib/auth.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.landing.meta.home");
  return { title: t("title"), description: t("description") };
}

/**
 * `/` (Figma Landing 114:2039 at 1440, Mobile 390 192:3586). Phase 0's root redirect lives here now:
 * signed-in staff go to their home (landing-model.ts), visitors see the landing page. Without an auth
 * cookie the lookup answers without a network call.
 */
export default async function LandingPage() {
  const target = homeRedirect(await getStaffMember());
  if (target) redirect(target);
  const locale = landingLocale(await getLocale());
  return (
    <>
      <Hero locale={locale} />
      <ProofStrip />
      <Pillars />
      <Features />
      <HowItWorks />
      <FlagNotFail />
      <PrivacyBand />
      <Universities />
      <Faq />
      <CtaBand />
    </>
  );
}

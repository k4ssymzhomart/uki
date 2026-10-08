import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { landingLocale } from "../../../features/landing/landing-model.ts";
import { TERMS_OF_USE } from "../../../features/landing/legal-content.ts";
import { LegalPage } from "../../../features/landing/legal-page.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.landing.meta.terms");
  return { title: t("title") };
}

/** `/terms`: the Terms of use (Figma 197:4144), a draft for legal review. Public, no session. */
export default async function TermsOfUsePage() {
  return <LegalPage document={TERMS_OF_USE} locale={landingLocale(await getLocale())} />;
}

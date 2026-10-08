import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { landingLocale } from "../../../features/landing/landing-model.ts";
import { PRIVACY_POLICY } from "../../../features/landing/legal-content.ts";
import { LegalPage } from "../../../features/landing/legal-page.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.landing.meta.privacy");
  return { title: t("title") };
}

/** `/privacy`: the Privacy policy (Figma 196:4125), a draft for legal review. Public, no session. */
export default async function PrivacyPolicyPage() {
  await connection(); // per request, in the visitor's language (the uki_locale cookie)
  return <LegalPage document={PRIVACY_POLICY} locale={landingLocale(await getLocale())} />;
}

import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { landingLocale } from "../../../features/landing/landing-model.ts";
import { TryBand } from "../../../features/try/try-band.tsx";
import { TryDemo } from "../../../features/try/try-demo.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.try.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * `/try`: the detection demo for visitors and judges (judge mode). Public, no session and no Supabase
 * call: the desktop app's detection worker runs on the visitor's camera in this tab, with the models
 * this site serves from /models/. Lockdown and the exam itself need the desktop app.
 */
export default async function TryPage() {
  const locale = landingLocale(await getLocale());
  return (
    <>
      <TryBand locale={locale} />
      <TryDemo />
    </>
  );
}

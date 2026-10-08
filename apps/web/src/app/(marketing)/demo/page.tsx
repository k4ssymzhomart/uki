import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DemoBand } from "../../../features/demo/demo-band.tsx";
import { DemoContent } from "../../../features/demo/demo-content.tsx";
import { demoVideo } from "../../../features/demo/demo-model.ts";
import { landingLocale } from "../../../features/landing/landing-model.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.landing.meta.demo");
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

/**
 * `/demo`, the jury page (a user request of 9 October; no Figma frame, docs/decisions.md). Public, no
 * session and no staff lookup: the live demo, the jury's email (the password is on the one-pager, never
 * here), the demo video from `NEXT_PUBLIC_DEMO_VIDEO_URL` or its placeholder, three things to try, the
 * in-browser detection demo and the release's files. Kept out of search engines.
 */
export default async function DemoPage() {
  const locale = landingLocale(await getLocale());
  return (
    <>
      <DemoBand locale={locale} />
      <DemoContent video={demoVideo(process.env.NEXT_PUBLIC_DEMO_VIDEO_URL)} />
    </>
  );
}

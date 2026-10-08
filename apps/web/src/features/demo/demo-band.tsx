import { Mascot } from "@uki/ui/art";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { LandingLocale } from "../landing/landing-model.ts";
import { SiteHeader } from "../landing/site-header.tsx";

/**
 * The jury page's header band (no Figma frame): the public header on the generated moss-night art, as
 * the legal pages draw it, with the page's title and the kit's waving mascot from 1024 px.
 */
export async function DemoBand({ locale }: { locale: LandingLocale }) {
  const t = await getTranslations("dashboard.landing.demo");
  return (
    <section data-theme="dark" className="relative isolate overflow-clip text-fg-primary">
      <Image
        src="/landing/moss-night.webp"
        alt=""
        fill
        preload
        unoptimized
        sizes="100vw"
        className="-z-10 object-cover"
      />
      <SiteHeader locale={locale} />
      <div className="mx-auto flex w-full max-w-300 items-end justify-between gap-10 px-6 pt-10 pb-14 lg:px-16 lg:pt-14 lg:pb-16 xl:px-0">
        <div className="flex flex-col items-start gap-4 lg:w-175">
          <p className="text-brand type-mono-overline">{t("overline")}</p>
          <h1 className="type-h2 lg:type-h1">{t("title")}</h1>
          <p className="opacity-72 type-body-m lg:type-body-l">{t("lead")}</p>
        </div>
        <Mascot pose="hello" size={180} className="hidden size-45 shrink-0 lg:block" />
      </div>
    </section>
  );
}

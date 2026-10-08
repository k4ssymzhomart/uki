import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { LandingLocale } from "../landing/landing-model.ts";
import { SiteHeader } from "../landing/site-header.tsx";

/**
 * The header band of /try, as /pilot draws its own (Book a pilot 194:4015): the public header on the
 * generated moss-night art, then the overline, the title and the lead. /try has no frame of its own.
 */
export async function TryBand({ locale }: { locale: LandingLocale }) {
  const t = await getTranslations("dashboard.try.band");
  return (
    <section data-theme="dark" className="relative isolate overflow-clip pb-14 lg:pb-16">
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
      <div className="mx-auto flex w-full max-w-300 flex-col items-start gap-4 px-6 pt-10 text-fg-primary lg:px-16 lg:pt-16 xl:px-0">
        <p className="text-brand type-mono-overline">{t("overline")}</p>
        <h1 className="type-h2 lg:w-180 lg:type-h1">{t("title")}</h1>
        <p className="opacity-72 type-body-m lg:w-140 lg:type-body-l">{t("lead")}</p>
      </div>
    </section>
  );
}

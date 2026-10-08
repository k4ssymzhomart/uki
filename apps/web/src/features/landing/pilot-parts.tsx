import { Icon } from "@uki/ui/icon";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { LandingLocale } from "./landing-model.ts";
import { SiteHeader } from "./site-header.tsx";

/**
 * The header band of /pilot (Figma 194:4015, 520 tall) on the generated moss-night art; Sent uses the
 * same art 380 tall without the pitch (195:4091). From 1280 the band is at least the frame's 520 and
 * grows with a longer pitch, as the Russian one is, so the lead never runs out of the dark art.
 */
export async function PilotBand({ locale, sent = false }: { locale: LandingLocale; sent?: boolean }) {
  const t = await getTranslations("dashboard.landing.pilot");
  return (
    <section
      data-theme="dark"
      className={
        sent
          ? "relative isolate h-60 overflow-clip lg:h-95"
          : "relative isolate overflow-clip pb-20 xl:min-h-130 xl:pb-12"
      }
    >
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
      {sent ? null : (
        <div className="mx-auto flex w-full max-w-300 flex-col items-start gap-4 px-6 pt-10 text-fg-primary lg:px-16 lg:pt-20.5 xl:px-0">
          <p className="text-brand type-mono-overline">{t("overline")}</p>
          <h1 className="type-h2 lg:w-140 lg:type-h1">{t("title")}</h1>
          <p className="opacity-72 type-body-m lg:w-125 lg:type-body-l">{t("lead")}</p>
        </div>
      )}
    </section>
  );
}

const WEEKS = ["call", "setup", "examWeek", "report"] as const;
const NEEDS = ["contact", "laptops", "lms"] as const;

/** "What the pilot looks like" (Figma 194:4032): four weeks between hairlines, then What you need. */
export async function PilotPlan() {
  const t = await getTranslations("dashboard.landing.pilot");
  return (
    <div className="flex flex-col gap-5 text-fg-primary">
      <h2 className="type-ui-title">{t("plan.title")}</h2>
      <ol>
        {WEEKS.map((week, index) => (
          <li key={week} className="flex gap-5 border-line-default border-t py-4">
            <p className="w-24 shrink-0 text-fg-accent type-mono-tag">{t("plan.week", { n: index })}</p>
            <div className="flex flex-col gap-1">
              <h3 className="type-card-title">{t(`plan.${week}.title`)}</h3>
              <p className="opacity-72 type-body-s">{t(`plan.${week}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 rounded-card bg-brand-subtle px-6 py-5">
        <h3 className="type-card-title">{t("need.title")}</h3>
        <ul className="flex flex-col gap-3">
          {NEEDS.map((need) => (
            <li key={need} className="flex items-center gap-2.5">
              <Icon name="check" className="size-4.5 shrink-0 text-ok" />
              <span className="type-body-s">{t(`need.${need}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

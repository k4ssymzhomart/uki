import { Face, Mascot } from "@uki/ui/art";
import { Icon } from "@uki/ui/icon";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LIVE_DEMO_HREF } from "../demo/demo-model.ts";
import { Badge, Button, LiveWidget, LockToast, StatusDot } from "./kit.tsx";
import type { LandingLocale } from "./landing-model.ts";
import { cx, LandingLink } from "./landing-parts.tsx";
import { SiteHeader } from "./site-header.tsx";

/**
 * Hero v2 (Figma 125:3549 at 1440, 192:3587 at 390): the generated lime-glow art behind the header and
 * the pitch, then the live wall as exported from Figma in a glass bezel. Around the bezel float the
 * Sees, Protects and Proves cards from the kit; at 390 only the Watching widget stays, at 70 %.
 * Positions are fractions of the bezel, so the composition holds between the two frames. The cards
 * hang outside the bezel, so from 1280 the bezel narrows until they fit the window (the frame's 1057
 * at 1440); below 1280 the bezel takes the width and only the Watching widget stays, as at 390.
 * Live demo (a user request of 9 October; not in the frames) joins Book a pilot and See the demo: it
 * opens sign-in with the jury's email filled in, then the live wall of DEMO-LIVE.
 */
export async function Hero({ locale }: { locale: LandingLocale }) {
  const t = await getTranslations("dashboard.landing.hero");
  const tCatalog = await getTranslations();
  return (
    <section className="relative isolate overflow-clip pb-10 lg:pb-14.25">
      <Image
        src="/landing/hero-glow.webp"
        alt=""
        fill
        preload
        unoptimized
        sizes="100vw"
        className="-z-10 object-cover"
      />
      <div data-theme="dark" className="text-fg-primary">
        <SiteHeader locale={locale} />
        <div className="flex flex-col gap-6 px-6 pt-6 lg:mx-auto lg:w-300 lg:max-w-full lg:items-center lg:gap-7 lg:px-0 lg:pt-15 lg:text-center">
          <p className="inline-flex items-center gap-2 self-start rounded-pill bg-surface py-1.5 pr-3 pl-1.5 lg:gap-2.5 lg:self-center lg:border lg:border-white/14 lg:bg-white/6 lg:pr-3.5">
            <Badge tone="ink" className="py-0.75 text-brand lg:bg-brand lg:py-1 lg:text-fg-on-brand">
              {t("badge")}
            </Badge>
            <span className="type-label-m lg:opacity-90">{t("announcement")}</span>
            <Icon name="arrow-right" className="hidden size-4 lg:block" />
          </p>
          <h1 className="type-h2 lg:type-display-m">
            <span className="lg:hidden">{t("title.mobile")}</span>
            <span className="hidden lg:block">{t("title.line1")}</span>
            <span className="hidden lg:block">
              {t.rich("title.line2", {
                accent: (chunks: ReactNode) => <span className="text-brand">{chunks}</span>,
              })}
            </span>
          </h1>
          <p className="opacity-72 type-body-m lg:w-175 lg:max-w-full lg:type-body-l">{t("lead")}</p>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:gap-3">
            <Button variant="brand" asChild className="w-full lg:w-auto">
              <LandingLink href="/pilot">{t("bookPilot")}</LandingLink>
            </Button>
            <Button variant="secondary" asChild className="w-full lg:w-auto">
              <LandingLink href="/#product">{t("seeDemo")}</LandingLink>
            </Button>
            <Button variant="secondary" asChild className="w-full lg:w-auto">
              <LandingLink href={LIVE_DEMO_HREF}>
                <StatusDot tone="ok" className="size-2" />
                {t("liveDemo")}
              </LandingLink>
            </Button>
          </div>
          <p className="hidden opacity-45 type-mono-tag lg:block">{t("case")}</p>
        </div>
      </div>

      <div className="relative mx-6 mt-11 lg:mx-auto lg:mt-18.5 lg:w-[calc(100%-var(--spacing)*12)] xl:w-[min(--spacing(264.25),calc((100vw-var(--spacing)*160)*1.42))]">
        <Mascot
          pose="peeking"
          size={150}
          className="pointer-events-none absolute top-[-7.68%] left-[7.66%] z-10 hidden h-auto w-[11.33%] lg:block"
        />
        <div className="rounded-[calc(var(--radius-sm)*2/3)] border border-white/16 bg-white/6 p-0.75 shadow-[0_0_--spacing(35)_--alpha(var(--color-brand)/22%)] backdrop-blur-md lg:rounded-card lg:p-2.25">
          <Image
            src="/landing/hero-live-wall.webp"
            alt={t("shotAlt")}
            width={2074}
            height={1383}
            unoptimized
            className="h-auto w-full rounded-[calc(var(--radius-sm)*2/3-var(--spacing)*0.75)] lg:rounded-[calc(var(--radius-card)-var(--spacing)*2.25)]"
          />
        </div>
        <LiveWidget
          title={tCatalog("exam.watch.title")}
          detail={tCatalog("exam.watch.status", { elapsed: t("watchElapsed") })}
          className="absolute top-[64%] left-[-1.75%] origin-top-left scale-70 whitespace-nowrap xl:top-[17.44%] xl:left-[-9.84%] xl:scale-100"
        />
        <div data-theme="dark" className="absolute top-[-3.66%] right-[-11.16%] hidden xl:block">
          <LockToast
            message={t("toast")}
            time={tCatalog("lock.copy.noted", { time: t("toastTime") })}
            className="shadow-float"
          />
        </div>
        <ReportCard className="absolute top-[34.88%] left-[85.15%] hidden xl:flex" />
      </div>
      <p className="px-6 pt-11 text-fg-primary opacity-80 type-mono-tag lg:hidden">{t("case")}</p>
    </section>
  );
}

/** "Proves · report card" (Figma 127:3579): the integrity report with its three flags and 0 MB of video. */
async function ReportCard({ className }: { className?: string }) {
  const t = await getTranslations("dashboard.landing.hero.report");
  const flags = [
    { id: "flag1", tone: "warn" },
    { id: "flag2", tone: "flag" },
    { id: "flag3", tone: "warn" },
  ] as const;
  return (
    <div
      className={cx(
        "w-75 flex-col gap-3.5 overflow-clip rounded-[calc(var(--radius-card)-var(--spacing))] border border-line-default bg-surface px-4.5 pt-4 pb-4.5 text-fg-primary shadow-float",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Face state="neutral" className="size-5.5" />
        <p className="flex-1 type-ui-label">{t("title")}</p>
        <Badge tone="ok">{t("ready")}</Badge>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="type-card-title">{t("student")}</p>
        <p className="opacity-60 type-ui-caption">{t("meta")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {flags.map((flag) => (
          <li key={flag.id} className="flex items-center gap-2.5">
            <StatusDot tone={flag.tone} className="size-2" />
            <span className="opacity-55 type-ui-mono">{t(`${flag.id}.time`)}</span>
            <span className="flex-1 type-ui-label">{t(`${flag.id}.label`)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-line-default border-t pt-3">
        <p className="flex-1 opacity-60 type-ui-caption">{t("decision")}</p>
        <Badge tone="warn">{t("talk")}</Badge>
      </div>
      <div className="flex items-center gap-3 rounded-sm bg-subtle px-3.5 py-3">
        <Icon name="cloud-off" className="size-5" />
        <div className="flex flex-col">
          <p className="opacity-60 type-ui-caption">{t("video")}</p>
          <p className="type-ui-title">{t("videoValue")}</p>
        </div>
      </div>
    </div>
  );
}

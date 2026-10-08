"use client";

import { Button } from "@uki/ui";
import { Logo, Mascot } from "@uki/ui/art";
import { useTranslations } from "next-intl";
import { LandingLink } from "../landing/landing-parts.tsx";
import { DEMO_LIVE_CODE, DEMO_LIVE_PATH } from "./demo-model.ts";

export type DemoLiveNoticeKind = "missing" | "failed";

/**
 * What `/demo/live` shows when it cannot open the live wall (a user request of 9 October; no Figma
 * frame): `missing` (a 404) when DEMO-LIVE does not exist yet or this account cannot see it, `failed`
 * when the database did not answer. Try again loads /demo/live in full; Your dashboard goes through `/`,
 * which sends staff to their home. Built from the kit's Button, the wordmark and a mascot pose.
 */
export function DemoLiveNotice({ kind }: { kind: DemoLiveNoticeKind }) {
  const t = useTranslations("dashboard.landing.demoLive");
  return (
    <div className="flex justify-center px-4 py-16 text-fg-primary lg:py-24">
      <section
        aria-labelledby="demo-live-title"
        className="flex w-full max-w-120 flex-col items-start gap-4 rounded-card bg-surface p-6 inset-ring inset-ring-line-default"
      >
        <LandingLink
          href="/"
          aria-label={t("home")}
          className="rounded-sm outline-none focus-visible:shadow-focus"
        >
          <Logo variant="wordmark-ink" className="h-6.5 w-auto" />
        </LandingLink>
        <Mascot pose={kind === "missing" ? "sleeping" : "oops"} size={96} className="size-24" />
        <h1 id="demo-live-title" className="type-h3">
          {t(`${kind}.title`)}
        </h1>
        <p className="opacity-72 type-body-s">{t(`${kind}.body`, { code: DEMO_LIVE_CODE })}</p>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary" asChild>
            <a href={DEMO_LIVE_PATH}>{t("retry")}</a>
          </Button>
          {kind === "missing" ? (
            <Button variant="secondary" asChild>
              <LandingLink href="/">{t("dashboard")}</LandingLink>
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

import { Icon } from "@uki/ui/icon";
import type { IconName } from "@uki/ui/icons";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DownloadFiles } from "../landing/download-section.tsx";
import { Button } from "../landing/kit.tsx";
import { cx, LandingLink } from "../landing/landing-parts.tsx";
import { DEMO_TRIES, type DemoVideo, JUDGE_EMAIL, LIVE_DEMO_HREF, TRY_PATH } from "./demo-model.ts";

/** A card on the jury page: surface on the canvas with the kit's default stroke. */
const CARD =
  "flex flex-col items-start gap-4 rounded-card bg-surface p-6 inset-ring inset-ring-line-default lg:p-8";

/** A card's round icon, as on the download cards. */
function CardIcon({ name }: { name: IconName }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-brand-subtle">
      <Icon name={name} className="size-5.5" />
    </span>
  );
}

function CardTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="type-h3">
      {children}
    </h2>
  );
}

/**
 * The jury page's body (a user request of 9 October; no Figma frame, docs/decisions.md), under the band
 * on /demo: the live dashboard with the jury's email and where the password is (never the password),
 * the demo video's slot, three things to try, the in-browser detection demo, and the release's student
 * app and Üki Lock files. Built from the landing's parts, the kit and the tokens. Not async, so the
 * Russian render test can draw it.
 */
export function DemoContent({ video }: { video: DemoVideo }) {
  const t = useTranslations("dashboard.landing.demo");
  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-6 px-6 pt-10 pb-20 text-fg-primary lg:gap-8 lg:px-16 lg:pt-16 lg:pb-30 xl:px-0">
      <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
        <section aria-labelledby="demo-dashboard" className={cx(CARD, "lg:col-span-3")}>
          <CardIcon name="eyes" />
          <CardTitle id="demo-dashboard">{t("dashboard.title")}</CardTitle>
          <p className="opacity-72 type-body-m">{t("dashboard.body")}</p>
          <dl className="flex w-full flex-col rounded-md bg-subtle px-4 py-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-line-default border-b py-3">
              <dt className="opacity-60 type-ui-label">{t("dashboard.email")}</dt>
              <dd className="select-all break-all type-ui-mono">{JUDGE_EMAIL}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="opacity-60 type-ui-label">{t("dashboard.password")}</dt>
              <dd className="type-ui-label">{t("dashboard.passwordWhere")}</dd>
            </div>
          </dl>
          <div className="flex w-full flex-col gap-2.5 lg:w-auto lg:flex-row">
            <Button variant="brand" asChild>
              <LandingLink href={LIVE_DEMO_HREF}>
                {t("dashboard.liveDemo")}
                <Icon name="arrow-right" className="size-4.5" />
              </LandingLink>
            </Button>
            <Button variant="secondary" asChild>
              <LandingLink href="/sign-in">{t("dashboard.open")}</LandingLink>
            </Button>
          </div>
        </section>

        <section aria-labelledby="demo-video" className={cx(CARD, "lg:col-span-2")}>
          <CardIcon name="play" />
          <CardTitle id="demo-video">{t("video.title")}</CardTitle>
          {video.kind === "link" ? (
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md bg-inverse px-6 text-center text-fg-inverse outline-none transition-colors hover:bg-inverse-hover focus-visible:shadow-focus"
            >
              <span className="flex size-14 items-center justify-center rounded-pill bg-brand text-fg-on-brand">
                <Icon name="play" className="size-6" />
              </span>
              <span className="type-label-m">{t("video.watch")}</span>
              <span className="opacity-72 type-card-caption">{t("video.newTab")}</span>
            </a>
          ) : (
            <div
              data-slot="demo-video-placeholder"
              className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md bg-subtle px-6 text-center inset-ring inset-ring-line-default"
            >
              <Icon name="play" className="size-6 opacity-60" />
              <span className="type-label-m">{t("video.soon.title")}</span>
              <span className="opacity-60 type-card-caption">{t("video.soon.body")}</span>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
        <section aria-labelledby="demo-tries" className={cx(CARD, "lg:col-span-3")}>
          <CardIcon name="list-check" />
          <CardTitle id="demo-tries">{t("tries.title")}</CardTitle>
          <ol className="flex w-full flex-col gap-4">
            {DEMO_TRIES.map((item, index) => (
              <li key={item.id} className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-inverse text-fg-inverse type-ui-label"
                >
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="flex items-center gap-2 type-card-title">
                    <Icon name={item.icon} className="size-4.5" />
                    {t(`tries.${item.id}.title`)}
                  </h3>
                  <p className="opacity-72 type-body-s">{t(`tries.${item.id}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="demo-try" className={cx(CARD, "lg:col-span-2")}>
          <CardIcon name="camera" />
          <CardTitle id="demo-try">{t("try.title")}</CardTitle>
          <p className="opacity-72 type-body-m">{t("try.body")}</p>
          <Button variant="secondary" asChild className="mt-auto">
            <LandingLink href={TRY_PATH}>
              {t("try.action")}
              <Icon name="arrow-right" className="size-4.5" />
            </LandingLink>
          </Button>
        </section>
      </div>

      <section aria-labelledby="demo-apps" className={cx(CARD, "gap-6")}>
        <div className="flex flex-col items-start gap-4">
          <CardIcon name="laptop" />
          <CardTitle id="demo-apps">{t("apps.title")}</CardTitle>
          <p className="opacity-72 type-body-m">{t("apps.body")}</p>
        </div>
        <DownloadFiles className="w-full" />
      </section>
    </div>
  );
}

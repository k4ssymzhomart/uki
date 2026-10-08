import { Icon } from "@uki/ui/icon";
import type { IconName } from "@uki/ui/icons";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SECTION } from "./landing-model.ts";
import { ArrowLink, LandingLink } from "./landing-parts.tsx";

const DATA = [
  { id: "video", icon: "camera" },
  { id: "frames", icon: "report" },
  { id: "audio", icon: "mic" },
] as const satisfies readonly { id: string; icon: IconName }[];

/**
 * Privacy (Figma 117:3454 at 1440, 193:4011 at 390): 0 MB on the generated moss-night art with the
 * laptop-and-shield 3D art; the mini data map as three cards, or three rows at 390 on plain ink.
 */
export async function PrivacyBand() {
  const t = await getTranslations("dashboard.landing.privacy");
  return (
    <section
      id={SECTION.privacy}
      data-theme="dark"
      className="relative isolate scroll-mt-6 overflow-clip bg-canvas px-6 py-14 text-fg-primary lg:flex lg:items-center lg:gap-12 lg:px-16 lg:py-32"
    >
      <Image
        src="/landing/moss-night.webp"
        alt=""
        fill
        unoptimized
        sizes="100vw"
        className="-z-10 hidden object-cover lg:block"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-4 lg:gap-5">
        <p className="text-brand type-mono-overline">{t("overline")}</p>
        <h2 className="flex flex-col">
          <span className="text-brand type-display-m lg:type-display-xl">{t("big")}</span>
          <span className="mt-4 type-h3 lg:mt-0 lg:type-h2">{t("title")}</span>
        </h2>
        <p className="opacity-72 type-body-s lg:w-150 lg:type-body-m">{t("body")}</p>
        <ul className="flex w-full flex-col gap-4 lg:w-auto lg:flex-row lg:gap-3 lg:pt-3">
          {DATA.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between border-line-default border-t py-3 lg:w-44 lg:flex-col lg:justify-start xl:w-50 lg:gap-2.5 lg:rounded-md lg:border lg:bg-surface lg:px-4.5 lg:py-4"
            >
              <Icon name={item.icon} className="hidden size-5 lg:block" />
              <p className="type-label-m lg:type-card-title">{t(`${item.id}.title`)}</p>
              <p className="opacity-72 type-card-caption lg:opacity-65">{t(`${item.id}.caption`)}</p>
            </li>
          ))}
        </ul>
        <LandingLink
          href="/privacy"
          className="text-brand underline type-label-m outline-none focus-visible:shadow-focus lg:hidden"
        >
          {t("link")}
        </LandingLink>
        <div className="hidden pt-2 lg:block">
          <ArrowLink href="/privacy">{t("link")}</ArrowLink>
        </div>
      </div>
      <Image
        src="/landing/3d-laptop-shield.webp"
        alt=""
        width={385}
        height={348}
        unoptimized
        className="hidden size-120 shrink-0 object-contain lg:block"
      />
    </section>
  );
}

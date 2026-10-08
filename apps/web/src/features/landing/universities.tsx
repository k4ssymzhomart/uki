import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Button, StatusDot } from "./kit.tsx";
import { SECTION } from "./landing-model.ts";
import { CheckPoint, LandingLink, Overline } from "./landing-parts.tsx";

const BULLETS = ["bullet1", "bullet2", "bullet3", "bullet4"] as const;

/**
 * Universities (Figma 117:3489 at 1440, 193:4027 at 390): the generated computer-lab and lecturer
 * photos with the floating group tag, then the points and Book a pilot. At 390 the lab photo follows
 * the points; below 1280 the points sit under the photos, which leave them too little width beside.
 */
export async function Universities() {
  const t = await getTranslations("dashboard.landing.universities");
  return (
    <section
      id={SECTION.universities}
      className="flex scroll-mt-6 flex-col gap-4 bg-canvas px-6 py-14 text-fg-primary lg:gap-12 lg:bg-surface lg:px-16 lg:py-32 xl:flex-row xl:items-center xl:gap-18"
    >
      <div className="relative order-2 h-55 shrink-0 lg:order-1 lg:h-140 lg:w-160">
        <Image
          src="/landing/photo-lab.webp"
          alt={t("labAlt")}
          width={1260}
          height={840}
          unoptimized
          className="size-full rounded-card object-cover lg:h-105 lg:w-140 lg:rounded-xl"
        />
        <Image
          src="/landing/photo-lecturer.webp"
          alt={t("lecturerAlt")}
          width={1020}
          height={680}
          unoptimized
          className="absolute top-55 left-85 hidden h-85 w-75 rounded-card border-8 border-surface object-cover shadow-float lg:block"
        />
        <p className="absolute top-112 left-6 hidden items-center gap-2 rounded-pill bg-surface py-2.5 pr-4 pl-3.5 shadow-float lg:flex">
          <StatusDot tone="brand" className="size-2" />
          <span className="type-label-m">{t("tag")}</span>
        </p>
      </div>
      <div className="order-1 flex min-w-0 flex-1 flex-col items-start gap-4 lg:order-2 lg:gap-5">
        <Overline>{t("overline")}</Overline>
        <h2 className="type-h3 lg:type-h2">{t("title")}</h2>
        <p className="opacity-70 type-body-s lg:type-body-m">{t("body")}</p>
        <ul className="flex flex-col gap-4 lg:gap-3">
          {BULLETS.map((bullet) => (
            <CheckPoint key={bullet}>{t(bullet)}</CheckPoint>
          ))}
        </ul>
        <Button asChild className="mt-3 hidden lg:inline-flex">
          <LandingLink href="/pilot">{t("bookPilot")}</LandingLink>
        </Button>
      </div>
    </section>
  );
}

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SECTION } from "./landing-model.ts";
import { ArrowLink, CheckPoint, cx, Overline } from "./landing-parts.tsx";

const FEATURES = [
  { id: "liveWall", anchor: SECTION.product, art: "/landing/feature-live-wall.webp", artFirst: false },
  { id: "lock", anchor: SECTION.lock, art: "/landing/feature-lock.webp", artFirst: true },
  { id: "review", anchor: SECTION.review, art: "/landing/feature-review.webp", artFirst: false },
] as const;

/**
 * Features (Figma 115:2527): the live wall, Üki Lock and review, each beside its art exported from
 * Figma (the generated backdrop with the product on it). The 390 frame has no feature rows, so they
 * show from 1024 up only.
 */
export async function Features() {
  const t = await getTranslations("dashboard.landing.features");
  return (
    <section
      id={SECTION.product}
      className="hidden scroll-mt-6 bg-canvas px-16 pt-10 pb-35 text-fg-primary lg:block"
    >
      <div className="flex flex-col gap-30">
        {FEATURES.map((feature) => (
          <article
            key={feature.id}
            id={feature.anchor === SECTION.product ? undefined : feature.anchor}
            className="flex scroll-mt-6 items-center gap-18"
          >
            <div
              className={cx("flex w-120 shrink-0 flex-col items-start gap-5", feature.artFirst && "order-2")}
            >
              <Overline>{t(`${feature.id}.overline`)}</Overline>
              <h2 className="type-h2">{t(`${feature.id}.title`)}</h2>
              <p className="opacity-70 type-body-m">{t(`${feature.id}.body`)}</p>
              <ul className="flex flex-col gap-3 pt-1">
                <CheckPoint>{t(`${feature.id}.bullet1`)}</CheckPoint>
                <CheckPoint>{t(`${feature.id}.bullet2`)}</CheckPoint>
                <CheckPoint>{t(`${feature.id}.bullet3`)}</CheckPoint>
              </ul>
              <ArrowLink href="/pilot" className="pt-2">
                {t(`${feature.id}.link`)}
              </ArrowLink>
            </div>
            <Image
              src={feature.art}
              alt={t(`${feature.id}.alt`)}
              width={1520}
              height={1080}
              unoptimized
              className={cx("h-auto min-w-0 flex-1", feature.artFirst && "order-1")}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

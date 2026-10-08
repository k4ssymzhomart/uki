import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SECTION } from "./landing-model.ts";
import { Overline } from "./landing-parts.tsx";

const PILLARS = [
  { id: "sees", art: "/landing/3d-sees.webp", width: 314, height: 340 },
  { id: "protects", art: "/landing/3d-protects.webp", width: 368, height: 350 },
  { id: "proves", art: "/landing/3d-proves.webp", width: 335, height: 361 },
] as const;

/**
 * Pillars (Figma 114:12254 at 1440, 192:3693 at 390): Sees, Protects, Proves with the brand kit's 3D
 * art, each under its Kazakh word. Cards stack at 390 with the art on the left.
 */
export async function Pillars() {
  const t = await getTranslations("dashboard.landing.pillars");
  return (
    <section
      id={SECTION.product}
      className="scroll-mt-6 bg-canvas px-6 py-14 text-fg-primary lg:px-16 lg:py-32"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-12">
        <div className="flex flex-1 flex-col gap-4">
          <Overline className="lg:text-fg-primary lg:opacity-55">{t("overline")}</Overline>
          <h2 className="type-h3 lg:type-h2">{t("title")}</h2>
        </div>
        <p className="opacity-70 type-body-s lg:w-110 lg:type-body-m">{t("lead")}</p>
      </div>
      <ul className="mt-4 flex flex-col gap-4 lg:mt-14 lg:flex-row lg:gap-6">
        {PILLARS.map((pillar) => (
          <li
            key={pillar.id}
            className="flex items-center gap-4 overflow-clip rounded-card border border-line-default bg-surface p-4.5 lg:flex-1 lg:flex-col lg:items-start lg:gap-3.5 lg:rounded-xl lg:px-8 lg:pt-7 lg:pb-9"
          >
            <Image
              src={pillar.art}
              alt=""
              width={pillar.width}
              height={pillar.height}
              unoptimized
              className="h-15 w-18 shrink-0 object-contain lg:size-44"
            />
            <div className="flex flex-col gap-1 lg:gap-3.5">
              <p className="text-fg-accent type-mono-tag lg:type-mono-overline" lang="kk">
                {t(`${pillar.id}.kazakh`)}
              </p>
              <h3 className="type-card-title lg:type-h3">{t(`${pillar.id}.title`)}</h3>
              <p className="opacity-72 type-card-caption lg:opacity-70 lg:type-body-m">
                {t(`${pillar.id}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

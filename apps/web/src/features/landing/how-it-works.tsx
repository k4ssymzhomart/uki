import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SECTION } from "./landing-model.ts";
import { cx, Overline } from "./landing-parts.tsx";

const STEPS = [
  { id: "setUp", art: "/landing/3d-setup.webp", width: 324, height: 392 },
  { id: "checkIn", art: "/landing/3d-checkin.webp", width: 354, height: 339 },
  { id: "write", art: "/landing/3d-write.webp", width: 319, height: 391 },
  { id: "review", art: "/landing/3d-proves.webp", width: 335, height: 361 },
] as const;

/**
 * How it works (Figma 116:3422 at 1440, 193:3977 at 390): four numbered steps joined by a line, each
 * with its 3D art; at 390 a numbered list between hairlines, without the art.
 */
export async function HowItWorks() {
  const t = await getTranslations("dashboard.landing.how");
  return (
    <section
      id={SECTION.howItWorks}
      className="scroll-mt-6 bg-surface px-6 py-14 text-fg-primary lg:px-16 lg:py-32"
    >
      <div className="flex flex-col gap-4">
        <Overline>{t("overline")}</Overline>
        <h2 className="type-h3 lg:type-h2">{t("title")}</h2>
      </div>
      <ol className="mt-4 flex flex-col gap-4 lg:mt-16 lg:flex-row lg:gap-6">
        {STEPS.map((step, index) => {
          const number = String(index + 1).padStart(2, "0");
          const last = index === STEPS.length - 1;
          return (
            <li
              key={step.id}
              className="flex items-start gap-4 border-line-default border-t py-3.5 lg:flex-1 lg:flex-col lg:gap-4 lg:border-0 lg:py-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-fg-accent type-mono-s lg:flex lg:size-12 lg:items-center lg:justify-center lg:rounded-card lg:bg-brand lg:text-fg-primary lg:type-mono-m">
                  {number}
                </span>
                <span
                  aria-hidden="true"
                  className={cx("hidden h-0.5 flex-1 bg-line-default", !last && "lg:block")}
                />
              </div>
              <Image
                src={step.art}
                alt=""
                width={step.width}
                height={step.height}
                unoptimized
                className="hidden size-30 object-contain lg:block"
              />
              <div className="flex flex-col gap-1 lg:gap-4">
                <h3 className="type-card-title lg:type-h3">{t(`${step.id}.title`)}</h3>
                <p className="opacity-72 type-card-caption lg:opacity-70 lg:type-body-s">
                  {t(`${step.id}.body`)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

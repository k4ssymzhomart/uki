import { Icon } from "@uki/ui/icon";
import { getTranslations } from "next-intl/server";
import { Button } from "./kit.tsx";
import { SECTION } from "./landing-model.ts";
import { LandingLink, Overline } from "./landing-parts.tsx";

const QUESTIONS = ["video", "flagged", "browsers", "lms", "retention", "student"] as const;

/**
 * FAQ (Figma 118:3474 at 1440, 193:4052 at 390): Disclosure rows as native <details>, so they open
 * without script; the first one starts open, as in the frames. At 390 the rows sit between hairlines.
 */
export async function Faq() {
  const t = await getTranslations("dashboard.landing.faq");
  return (
    <section
      id={SECTION.faq}
      className="flex scroll-mt-6 flex-col gap-4 bg-surface px-6 py-14 text-fg-primary lg:flex-row lg:items-start lg:gap-18 lg:bg-canvas lg:px-16 lg:py-32"
    >
      <div className="flex flex-col items-start gap-4 lg:w-100 lg:shrink-0 lg:gap-5">
        <Overline>{t("overline")}</Overline>
        <h2 className="type-h3 lg:type-h2">{t("title")}</h2>
        <p className="hidden w-95 opacity-70 type-body-m lg:block">{t("body")}</p>
        <Button variant="secondary" asChild className="hidden lg:inline-flex">
          <LandingLink href="/pilot">{t("write")}</LandingLink>
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-3">
        {QUESTIONS.map((question, index) => (
          <details
            key={question}
            open={index === 0}
            className="group border-line-default border-t pt-4.25 pb-4 lg:rounded-md lg:border lg:bg-surface lg:px-5 lg:py-4"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
              <span className="flex-1 type-card-title">{t(`${question}.question`)}</span>
              <Icon
                name="chevron-down"
                className="size-5 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="mt-2 opacity-70 type-body-s lg:mt-2.5">{t(`${question}.answer`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

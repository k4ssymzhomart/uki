import { getTranslations } from "next-intl/server";
import { cx } from "./landing-parts.tsx";

const FACTS = ["video", "languages", "checks", "report"] as const;

/**
 * Proof strip (Figma 114:12241 at 1440, 192:3677 at 390): four facts in a row with dividers, or a
 * two-by-two grid at 390.
 */
export async function ProofStrip() {
  const t = await getTranslations("dashboard.landing.proof");
  return (
    <section className="border-line-default border-b bg-surface px-6 py-8 text-fg-primary lg:px-16 lg:py-10">
      <ul className="grid grid-cols-2 gap-4 lg:flex lg:gap-0">
        {FACTS.map((fact, index) => (
          <li
            key={fact}
            className={cx(
              "flex flex-col gap-1 lg:flex-1",
              index > 0 && "lg:border-line-default lg:border-l lg:pl-8",
            )}
          >
            <p className="type-h3 lg:type-h2">{t(`${fact}.value`)}</p>
            <p className="max-w-40 opacity-64 type-card-caption lg:max-w-none lg:opacity-60">
              {t(`${fact}.caption`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

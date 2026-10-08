import { LOCALE_LABELS } from "@uki/i18n";
import { getTranslations } from "next-intl/server";
import { LANDING_LOCALES, type LandingLocale } from "./landing-model.ts";
import { cx } from "./landing-parts.tsx";
import { setLandingLocale } from "./locale-action.ts";

/**
 * РУС and ENG in the header and the footer (Figma "ҚАЗ  РУС  ENG", Mono/S at 60 %). Each is a submit
 * button of a server action, so the switch works before the page hydrates. The public pages have
 * English and Russian strings only, so ҚАЗ stays hidden until Kazakh landing copy exists
 * (docs/decisions.md). The current language is drawn at full strength.
 */
export async function LanguageSwitch({ current, className }: { current: LandingLocale; className?: string }) {
  const t = await getTranslations("dashboard.landing.lang");
  return (
    <form
      action={setLandingLocale}
      aria-label={t("label")}
      className={cx("flex items-center gap-4", className)}
    >
      {LANDING_LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          aria-pressed={locale === current}
          lang={locale}
          className={cx(
            "cursor-pointer rounded-sm type-mono-s outline-none transition-opacity hover:opacity-100 focus-visible:shadow-focus",
            locale === current ? "opacity-100" : "opacity-60",
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </form>
  );
}

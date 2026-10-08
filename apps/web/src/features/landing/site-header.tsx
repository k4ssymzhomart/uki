import { LOCALE_LABELS } from "@uki/i18n";
import { Logo } from "@uki/ui/art";
import { getTranslations } from "next-intl/server";
import { Button } from "./kit.tsx";
import { type LandingLocale, NAV_LINKS, otherLocale, sectionHref } from "./landing-model.ts";
import { cx, LandingLink } from "./landing-parts.tsx";
import { LanguageSwitch } from "./language-switch.tsx";
import { setLandingLocale } from "./locale-action.ts";
import { MobileMenu } from "./mobile-menu.tsx";

/**
 * The public header (Figma Nav 114:2041 at 1440, 192:3588 at 390), drawn on the dark art of each page
 * under data-theme="dark". Sign in is not in the frame; the plan puts it in the header, so it sits with
 * the links (docs/decisions.md). Below 1280 the gaps tighten so the Russian links fit from 1024.
 */
export async function SiteHeader({ locale, className }: { locale: LandingLocale; className?: string }) {
  const t = await getTranslations("dashboard.landing.nav");
  const other = otherLocale(locale);
  return (
    <header className={cx("relative z-10 text-fg-primary", className)}>
      <div className="hidden h-22 items-center gap-4 px-8 lg:flex xl:gap-8 xl:px-16">
        <LandingLink
          href="/"
          aria-label={t("home")}
          className="rounded-sm outline-none focus-visible:shadow-focus"
        >
          <Logo variant="wordmark-paper" className="h-8 w-auto" />
        </LandingLink>
        <span aria-hidden="true" className="flex-1" />
        <nav aria-label={t("label")} className="flex items-center gap-4 xl:gap-8">
          {NAV_LINKS.map((link) => (
            <LandingLink
              key={link.key}
              href={sectionHref(link.section)}
              className="whitespace-nowrap rounded-sm opacity-80 type-label-m outline-none transition-opacity hover:opacity-100 focus-visible:shadow-focus"
            >
              {t(link.key)}
            </LandingLink>
          ))}
        </nav>
        <span aria-hidden="true" className="flex-1" />
        <LandingLink
          href="/sign-in"
          className="whitespace-nowrap rounded-sm opacity-80 type-label-m outline-none transition-opacity hover:opacity-100 focus-visible:shadow-focus"
        >
          {t("signIn")}
        </LandingLink>
        <LanguageSwitch current={locale} />
        <Button variant="brand" asChild>
          <LandingLink href="/pilot">{t("bookPilot")}</LandingLink>
        </Button>
      </div>
      <div className="flex items-center justify-between px-6 pt-14 lg:hidden">
        <div className="flex w-full items-center justify-between py-4">
          <LandingLink
            href="/"
            aria-label={t("home")}
            className="rounded-sm outline-none focus-visible:shadow-focus"
          >
            <Logo variant="wordmark-paper" className="h-7 w-auto" />
          </LandingLink>
          <div className="flex items-center gap-2">
            <form action={setLandingLocale}>
              <button
                type="submit"
                name="locale"
                value={other}
                lang={other}
                className="cursor-pointer rounded-sm px-1 type-label-m outline-none focus-visible:shadow-focus"
              >
                {LOCALE_LABELS[locale]}
              </button>
            </form>
            <MobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

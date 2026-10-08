import { Logo } from "@uki/ui/art";
import { getLocale, getTranslations } from "next-intl/server";
import { landingLocale, SECTION, sectionHref } from "./landing-model.ts";
import { type LandingHref, LandingLink } from "./landing-parts.tsx";
import { LanguageSwitch } from "./language-switch.tsx";

/**
 * Where the footer links go. The frames draw them without targets; each points at the closest page or
 * section that exists in Phase 1 (docs/decisions.md).
 */
const COLUMNS = [
  {
    heading: "product",
    links: [
      // The app and the Lock lead to their downloads (decided by the user on 8 October).
      { key: "app", href: sectionHref(SECTION.download) },
      { key: "lock", href: sectionHref(SECTION.download) },
      { key: "liveWall", href: sectionHref(SECTION.liveWall) },
      { key: "reports", href: sectionHref(SECTION.review) },
    ],
  },
  {
    heading: "trust",
    links: [
      { key: "privacy", href: "/privacy" },
      { key: "dataMap", href: sectionHref(SECTION.privacy) },
      { key: "auditLog", href: "/privacy#access" },
      { key: "security", href: "/terms" },
    ],
  },
  {
    heading: "about",
    links: [
      { key: "case", shortKey: "caseShort", href: sectionHref(SECTION.universities) },
      { key: "team", href: sectionHref(SECTION.faq) },
      { key: "contact", href: "/pilot" },
    ],
  },
] as const satisfies readonly {
  heading: string;
  links: readonly { key: string; href: LandingHref; shortKey?: string }[];
}[];

/**
 * Footer (Figma 118:3577 at 1440, 193:4110 at 390): ink at 1440, paper at 390. Same on every public
 * page, from the (marketing) layout.
 */
export async function SiteFooter() {
  const t = await getTranslations("dashboard.landing.footer");
  const locale = landingLocale(await getLocale());
  return (
    <footer className="flex flex-col gap-5 bg-canvas px-6 pt-10 pb-10 text-fg-primary lg:gap-14 lg:bg-inverse lg:px-16 lg:pt-20 lg:pb-12 lg:text-fg-inverse">
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-12">
        <div className="flex flex-col items-start gap-5 lg:flex-1 lg:gap-4">
          <Logo variant="wordmark-ink" className="h-8 w-auto lg:hidden" />
          <Logo variant="wordmark-paper" className="hidden h-9 w-auto lg:block" />
          <p className="type-card-title lg:font-normal lg:type-body-m" lang="kk">
            {t("tagline")}
          </p>
          <p className="opacity-64 type-card-caption lg:opacity-60 lg:type-ui-caption">{t("line")}</p>
        </div>
        <div className="grid grid-cols-3 gap-4 lg:flex lg:gap-12">
          {COLUMNS.map((column) => (
            <nav
              key={column.heading}
              aria-label={t(column.heading)}
              className="flex flex-col gap-2 lg:w-40 lg:gap-3 xl:w-55"
            >
              <p className="opacity-50 type-mono-tag">{t(column.heading)}</p>
              {column.links.map((link) => (
                <LandingLink
                  key={link.key}
                  href={link.href}
                  className="self-start rounded-sm type-card-caption outline-none transition-opacity focus-visible:shadow-focus lg:opacity-85 lg:type-label-m lg:hover:opacity-100"
                >
                  {"shortKey" in link ? (
                    <>
                      <span className="lg:hidden">{t(link.shortKey)}</span>
                      <span className="hidden lg:inline">{t(link.key)}</span>
                    </>
                  ) : (
                    t(link.key)
                  )}
                </LandingLink>
              ))}
            </nav>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-3 border-line-default border-t pt-4 lg:border-inverse-hover lg:pt-6">
        <p className="flex-1 opacity-55 type-ui-mono lg:type-ui-caption">
          <span className="lg:hidden">{t("copyrightShort")}</span>
          <span className="hidden lg:inline">{t("copyright")}</span>
        </p>
        <LanguageSwitch current={locale} />
      </div>
    </footer>
  );
}

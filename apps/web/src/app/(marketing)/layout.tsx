import type { ReactNode } from "react";
import { SiteFooter } from "../../features/landing/site-footer.tsx";

/**
 * The public pages: `/`, `/pilot`, `/privacy` and `/terms` (WP 1.13). No app shell and no staff check:
 * src/proxy.ts passes requests without an auth cookie straight through, and nothing here calls
 * requireStaff. Every page brings its own header on its own art; the footer is shared. Russian words
 * of 12 letters or more may hyphenate, so «экзаменационная» fits a 390 heading; a word that still does
 * not fit breaks rather than running out of the window.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col wrap-break-word bg-canvas text-fg-primary [&:lang(ru)]:hyphens-auto [&:lang(ru)]:[hyphenate-limit-chars:12_5_4]">
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

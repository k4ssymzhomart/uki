"use client";

import { Banner, Button, cn } from "@uki/ui";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/** This page's own address, query included, so Try again loads the same page. */
export function retryHref(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Shown instead of a dashboard page when the staff lookup failed twice (lib/auth.ts requireStaff): Auth
 * or the database did not answer, and the proctor may well be signed in, so this never sends them to
 * sign-in. Try again is a plain link that loads the page in full, so the proxy refreshes the session
 * and the lookup runs again. `standalone` fills the screen, for the (app) layout, which has no staff
 * member to draw the shell with; otherwise it fills the shell's page column (after a client navigation).
 * An error Banner (Figma 145:2770); the dashboard's error states are Phase 2 frames.
 */
export function StaffLookupFailed({ standalone = false }: { standalone?: boolean }) {
  const t = useTranslations("dashboard.shell.lookupFailed");
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <main
      className={cn(
        "flex flex-1 justify-center px-8 py-12",
        standalone ? "min-h-screen items-center bg-canvas text-fg-primary" : "items-start",
      )}
    >
      <Banner
        kind="error"
        className="w-150 max-w-full"
        title={t("title")}
        body={t("body")}
        action={
          <Button variant="secondary" asChild>
            <a href={retryHref(pathname, search)}>{t("retry")}</a>
          </Button>
        }
      />
    </main>
  );
}

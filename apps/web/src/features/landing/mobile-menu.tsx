"use client";

import { Button, cn } from "@uki/ui";
import { Icon } from "@uki/ui/icon";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { NAV_LINKS, sectionHref } from "./landing-model.ts";
import { LandingLink } from "./landing-parts.tsx";

/**
 * The menu button of the 390 header (Figma Nav 192:3588, Icon button with icon/menu). The frame has no
 * open state, so the list reuses the desktop header's links in a floating surface (docs/decisions.md).
 * Escape and any link close it.
 */
export function MobileMenu() {
  const t = useTranslations("dashboard.landing.nav");
  const [open, setOpen] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 cursor-pointer items-center justify-center rounded-pill border border-line-default bg-surface text-fg-primary outline-none transition-colors hover:bg-hover focus-visible:shadow-focus"
      >
        <Icon name={open ? "close" : "menu"} className="size-5" />
      </button>
      <nav
        id={listId}
        aria-label={t("label")}
        hidden={!open}
        className={cn(
          "absolute top-full right-0 z-20 mt-2 w-64 flex-col gap-1 rounded-card border border-line-default bg-surface p-2 text-fg-primary shadow-float",
          open && "flex",
        )}
      >
        {NAV_LINKS.map((link) => (
          <LandingLink
            key={link.key}
            href={sectionHref(link.section)}
            onClick={() => setOpen(false)}
            className="rounded-sm px-3 py-2.5 type-label-m outline-none hover:bg-hover focus-visible:shadow-focus"
          >
            {t(link.key)}
          </LandingLink>
        ))}
        <LandingLink
          href="/sign-in"
          onClick={() => setOpen(false)}
          className="rounded-sm px-3 py-2.5 type-label-m outline-none hover:bg-hover focus-visible:shadow-focus"
        >
          {t("signIn")}
        </LandingLink>
        <Button variant="brand" asChild className="mt-1 w-full">
          <LandingLink href="/pilot" onClick={() => setOpen(false)}>
            {t("bookPilot")}
          </LandingLink>
        </Button>
      </nav>
    </div>
  );
}

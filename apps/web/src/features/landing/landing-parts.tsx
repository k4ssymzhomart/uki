import { Icon } from "@uki/ui/icon";
import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** A public-page href: a page, or a section of `/` (`/#faq`). */
export type LandingHref = Route | `/#${string}`;

/** next/link for the public pages; section links are typed as routes here. */
export function LandingLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: LandingHref }) {
  return <Link href={href as Route} {...props} />;
}

/** Mono overline above a section title (Figma Mono/Overline in text/accent). */
export function Overline({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cx("type-mono-overline text-fg-accent", className)}>{children}</p>;
}

/**
 * A point with the lime check mark (Figma Bullet: a 24 px lime circle with icon/check at 14 px), as on
 * the feature, universities and pilot sections.
 */
export function CheckPoint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li className={cx("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex size-4.5 shrink-0 items-center justify-center rounded-pill lg:size-6 lg:bg-brand"
      >
        <Icon name="check" className="size-4.5 text-ok lg:size-3.5 lg:text-fg-on-brand" />
      </span>
      <span className="type-body-s lg:opacity-90">{children}</span>
    </li>
  );
}

/** "See the live wall →": a label with the arrow, its arrow moving on hover. */
export function ArrowLink({
  href,
  children,
  className,
  onClick,
}: {
  href: LandingHref;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <LandingLink
      href={href}
      onClick={onClick}
      className={cx(
        "group inline-flex items-center gap-1.5 rounded-sm type-label-m outline-none focus-visible:shadow-focus",
        className,
      )}
    >
      {children}
      <Icon name="arrow-right" className="size-4.5 transition-transform group-hover:translate-x-0.5" />
    </LandingLink>
  );
}

/** Joins class names. Server components cannot import the kit's `cn` (its barrel is client-only). */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

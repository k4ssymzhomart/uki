import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../cn.ts";
import { Count, type CountTone } from "../data/count.tsx";
import { Tooltip } from "../feedback/tooltip.tsx";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import type { LinkComponent } from "./link.ts";
import { railClasses, type SidebarLayout, useSidebarLayout } from "./sidebar-layout.ts";

const item = cva(
  "flex w-full items-center gap-3 rounded-sm py-2.25 pr-2.5 pl-3 text-fg-primary outline-none hover:bg-hover active:bg-pressed focus-visible:shadow-focus",
  {
    variants: {
      active: { true: "bg-brand-subtle hover:bg-brand-subtle active:bg-brand-subtle", false: "" },
      layout: {
        full: "",
        rail: "justify-center px-2.5",
        responsive: "max-xl:justify-center max-xl:px-2.5",
      },
    },
  },
);

export type NavItemProps = {
  icon: IconName;
  /** "Exams". In the icon rail it stays as the link's accessible name. */
  label: ReactNode;
  href: string;
  /** Shows a Count on the right when set: "4". */
  count?: ReactNode;
  countTone?: CountTone;
  /** The current page: brand-subtle wash and aria-current="page". */
  active?: boolean;
  /** Link component, for example Next.js Link. Defaults to "a". */
  linkAs?: LinkComponent;
  /** Defaults to the surrounding AppSidebar's layout. */
  layout?: SidebarLayout;
  className?: string;
};

/**
 * Sidebar navigation row (Figma Nav item 40:2055). In the icon rail the label is visually hidden and
 * shows as a tooltip on hover and keyboard focus.
 */
export function NavItem({
  icon,
  label,
  href,
  count,
  countTone = "neutral",
  active = false,
  linkAs: Link = "a",
  layout: layoutProp,
  className,
}: NavItemProps) {
  const layout = useSidebarLayout(layoutProp);
  const rail = railClasses[layout];
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(item({ active, layout }), className)}
    >
      <Icon name={icon} className={cn("size-5", !active && "opacity-72")} />
      <span className={cn("min-w-0 flex-1 truncate type-label-m", !active && "opacity-72", rail.srOnly)}>
        {label}
      </span>
      {count === undefined ? null : (
        <>
          {/* A space, so the link's name reads "Exams 4", not "Exams4". */}{" "}
          <Count tone={countTone} className={rail.hide}>
            {count}
          </Count>
        </>
      )}
    </Link>
  );
  if (layout === "full") return link;
  return (
    <Tooltip content={label} side="right" className={layout === "responsive" ? "xl:hidden" : undefined}>
      {link}
    </Tooltip>
  );
}

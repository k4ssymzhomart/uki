import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import type { CountTone } from "../data/count.tsx";
import type { IconName } from "../icons.ts";
import type { LinkComponent } from "./link.ts";
import { NavItem } from "./nav-item.tsx";
import { railClasses, type SidebarLayout, SidebarLayoutContext } from "./sidebar-layout.ts";

export type SidebarNavItem = {
  id: string;
  icon: IconName;
  label: ReactNode;
  href: string;
  count?: ReactNode;
  countTone?: CountTone;
  active?: boolean;
};

export type SidebarSection = {
  id: string;
  /** Mono overline above the items: "Workspace", "Admin". */
  label?: ReactNode;
  items: readonly SidebarNavItem[];
};

const WIDTH: Record<SidebarLayout, string> = { full: "w-64", rail: "w-18", responsive: "w-18 xl:w-64" };
const BRAND: Record<SidebarLayout, string> = {
  full: "",
  rail: "justify-center pl-0",
  responsive: "max-xl:justify-center max-xl:pl-0",
};

export type AppSidebarProps = Omit<ComponentProps<"aside">, "children" | "role"> & {
  /** The Üki wordmark (brand art). */
  logo: ReactNode;
  /** What the icon rail shows instead of the wordmark, for example the Mark; defaults to logo. */
  logoCompact?: ReactNode;
  /** Mono label right of the logo: "Proctor". */
  roleLabel?: ReactNode;
  /** Usually <SidebarWorkspace />. */
  workspace?: ReactNode;
  sections: readonly SidebarSection[];
  /** Accessible name of the navigation landmark. */
  navLabel: string;
  /** Usually <SidebarNote />; hidden in the icon rail. */
  note?: ReactNode;
  /** Usually <SidebarUser />. */
  user?: ReactNode;
  /** Link component for nav items, for example Next.js Link. Defaults to "a". */
  linkAs?: LinkComponent;
  /** "responsive" (default): rail from 1024 to 1279 px, full sidebar from 1280 px. */
  layout?: SidebarLayout;
};

/**
 * Dashboard sidebar for proctors and the exam office (Figma App/Sidebar 47:2070): 256 px at 1280 px and
 * up, a 72 px icon rail from 1024 to 1279 px. Nav items come in as data; mark one active per screen.
 */
export function AppSidebar({
  logo,
  logoCompact,
  roleLabel,
  workspace,
  sections,
  navLabel,
  note,
  user,
  linkAs,
  layout = "responsive",
  className,
  ...props
}: AppSidebarProps) {
  const rail = railClasses[layout];
  return (
    <SidebarLayoutContext value={layout}>
      <aside
        data-layout={layout}
        className={cn(
          "flex h-full shrink-0 flex-col items-start gap-0.5 overflow-y-auto border-r border-line-default bg-canvas px-4 pt-5.5 pb-4 text-fg-primary",
          WIDTH[layout],
          className,
        )}
        {...props}
      >
        <div
          className={cn("flex w-full shrink-0 items-center gap-2.5 overflow-clip pb-4.5 pl-2", BRAND[layout])}
        >
          {logoCompact === undefined ? (
            logo
          ) : (
            <>
              <span className={cn("flex shrink-0", rail.hide)}>{logo}</span>
              <span className={cn("flex shrink-0", rail.railOnly)}>{logoCompact}</span>
            </>
          )}
          {roleLabel === undefined ? null : (
            <>
              <span aria-hidden="true" className={cn("min-w-0 flex-1", rail.hide)} />
              <span className={cn("shrink-0 whitespace-nowrap type-mono-tag", rail.hide)}>{roleLabel}</span>
            </>
          )}
        </div>
        {workspace === undefined ? null : <div className="w-full shrink-0">{workspace}</div>}
        <nav aria-label={navLabel} className="flex w-full shrink-0 flex-col items-start gap-0.5">
          {sections.map((section) => (
            <div key={section.id} className="flex w-full flex-col items-start gap-0.5">
              <span aria-hidden="true" className="h-4.5 shrink-0" />
              {section.label === undefined ? null : (
                <p
                  className={cn(
                    "shrink-0 overflow-clip whitespace-nowrap pb-1.5 pl-3 type-mono-tag",
                    rail.srOnly,
                  )}
                >
                  {section.label}
                </p>
              )}
              <ul className="flex w-full flex-col gap-0.5">
                {section.items.map((navItem) => (
                  <li key={navItem.id}>
                    <NavItem
                      icon={navItem.icon}
                      label={navItem.label}
                      href={navItem.href}
                      count={navItem.count}
                      countTone={navItem.countTone}
                      active={navItem.active}
                      linkAs={linkAs}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <span aria-hidden="true" className="min-h-0 w-full flex-1" />
        {note === undefined ? null : <div className={cn("w-full shrink-0", rail.hide)}>{note}</div>}
        {user === undefined ? null : (
          <>
            <span aria-hidden="true" className="h-3 shrink-0" />
            <div className="w-full shrink-0">{user}</div>
          </>
        )}
      </aside>
    </SidebarLayoutContext>
  );
}

import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Avatar } from "../data/avatar.tsx";
import { Icon } from "../icon.tsx";
import { railClasses, type SidebarLayout, useSidebarLayout } from "./sidebar-layout.ts";

const box = cva(
  "flex w-full cursor-pointer items-center gap-2.5 overflow-clip rounded-sm bg-subtle p-2.5 text-left text-fg-primary outline-none hover:bg-pressed focus-visible:shadow-focus",
  {
    variants: {
      layout: { full: "", rail: "justify-center p-1", responsive: "max-xl:justify-center max-xl:p-1" },
    },
  },
);

export type SidebarWorkspaceProps = Omit<ComponentProps<"button">, "children"> & {
  /** "K". */
  initials: ReactNode;
  /** "KRU · Kostanay". */
  name: ReactNode;
  /** "Faculty of Mathematics". */
  detail?: ReactNode;
  layout?: SidebarLayout;
};

/**
 * The workspace card under the logo in App/Sidebar (Figma 47:2080). A button, so it can be the
 * trigger of the workspace menu (Radix DropdownMenu.Trigger asChild).
 */
export function SidebarWorkspace({
  initials,
  name,
  detail,
  layout: layoutProp,
  className,
  type,
  ...props
}: SidebarWorkspaceProps) {
  const layout = useSidebarLayout(layoutProp);
  const rail = railClasses[layout];
  return (
    <button type={type ?? "button"} className={cn(box({ layout }), className)} {...props}>
      <Avatar tone="lime" initials={initials} />
      <span
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start overflow-clip whitespace-nowrap",
          rail.srOnly,
        )}
      >
        <span className="type-ui-label">{name}</span>
        {detail === undefined ? null : <span className="type-ui-caption">{detail}</span>}
      </span>
      <Icon name="chevron-down" className={cn("size-4.5 opacity-60", rail.hide)} />
    </button>
  );
}

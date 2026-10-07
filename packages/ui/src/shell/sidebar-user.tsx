import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Avatar } from "../data/avatar.tsx";
import { Icon } from "../icon.tsx";
import { railClasses, type SidebarLayout, useSidebarLayout } from "./sidebar-layout.ts";

const box = cva(
  "flex w-full cursor-pointer items-center gap-2.5 overflow-clip rounded-sm pr-1 pl-2 text-left text-fg-primary outline-none hover:bg-hover focus-visible:shadow-focus",
  {
    variants: {
      layout: { full: "", rail: "justify-center px-0", responsive: "max-xl:justify-center max-xl:px-0" },
    },
  },
);

export type SidebarUserProps = Omit<ComponentProps<"button">, "children"> & {
  /** "AS". */
  initials: ReactNode;
  /** "Aigerim Sadykova". */
  name: ReactNode;
  /** The user's role: "Proctor · Group 204". */
  detail?: ReactNode;
  layout?: SidebarLayout;
};

/**
 * The signed-in user at the foot of App/Sidebar (Figma 47:2193). A button, so it can be the trigger of
 * the user menu (Radix DropdownMenu.Trigger asChild).
 */
export function SidebarUser({
  initials,
  name,
  detail,
  layout: layoutProp,
  className,
  type,
  ...props
}: SidebarUserProps) {
  const layout = useSidebarLayout(layoutProp);
  const rail = railClasses[layout];
  return (
    <button type={type ?? "button"} className={cn(box({ layout }), className)} {...props}>
      <Avatar tone="ink" initials={initials} />
      <span
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start overflow-clip whitespace-nowrap",
          rail.srOnly,
        )}
      >
        <span className="type-ui-label">{name}</span>
        {detail === undefined ? null : <span className="type-ui-caption">{detail}</span>}
      </span>
      <Icon name="more" className={cn("size-4.5 opacity-60", rail.hide)} />
    </button>
  );
}

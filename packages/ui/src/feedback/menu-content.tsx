import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

/** The floating list of Select (79:2410) and the menus: surface, default stroke, 6 px padding, Shadow/Float. */
export const floatingListClasses =
  "z-50 flex flex-col gap-0.5 overflow-hidden rounded-md bg-surface p-1.5 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none";

export type MenuContentProps = ComponentProps<typeof DropdownMenu.Content> & {
  /** Portal target; defaults to document.body. Pass a node inside a data-theme="dark" region to keep its theme. */
  container?: HTMLElement | null;
};

/** Dropdown menu panel, 248 px minimum like Figma's Menu item, holding MenuItem, MenuLabel and MenuSeparator. */
export function MenuContent({
  className,
  sideOffset = 8,
  align = "start",
  container,
  ...props
}: MenuContentProps) {
  return (
    <DropdownMenu.Portal container={container}>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(floatingListClasses, "min-w-62", className)}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

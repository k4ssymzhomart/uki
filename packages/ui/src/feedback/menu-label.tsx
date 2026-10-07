import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

export type MenuLabelProps = ComponentProps<typeof DropdownMenu.Label>;

/** Small caps label above a group of menu items (Figma Menu header 71:2208), in Mono/Tag at 50 %. */
export function MenuLabel({ className, ...props }: MenuLabelProps) {
  return (
    <DropdownMenu.Label
      className={cn("px-2.5 pt-2 pb-1 type-mono-tag text-fg-primary opacity-50", className)}
      {...props}
    />
  );
}

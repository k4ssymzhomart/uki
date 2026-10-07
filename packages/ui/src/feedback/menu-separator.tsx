import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

export type MenuSeparatorProps = ComponentProps<typeof DropdownMenu.Separator>;

/** Divider between menu groups (Figma Menu separator 71:2210): a 1 px border/default line, inset 6 px. */
export function MenuSeparator({ className, ...props }: MenuSeparatorProps) {
  return <DropdownMenu.Separator className={cn("mx-1.5 my-1 h-px bg-line-default", className)} {...props} />;
}

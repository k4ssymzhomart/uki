import { cn } from "../cn.ts";
import { ActionMenu, type ActionMenuProps } from "./action-menu.tsx";

export type QuickMessageMenuProps = ActionMenuProps;

/**
 * Proctor messages to the group or one student, translated per student (Figma Menu/Quick message 75:2259,
 * frame 2.4b): the presets with keys 1 to 3, then Write a message (M), then the globe note.
 */
export function QuickMessageMenu({ className, ...props }: QuickMessageMenuProps) {
  return <ActionMenu className={cn("w-70", className)} {...props} />;
}

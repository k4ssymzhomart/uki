import { cn } from "../cn.ts";
import { ActionMenu, type ActionMenuProps } from "./action-menu.tsx";

export type TileActionsMenuProps = Omit<ActionMenuProps, "note" | "noteIcon">;

/**
 * Actions for one student on the live wall (Figma Menu/Tile actions 75:2198, frame 2.4a): Open timeline (T),
 * Message (M), Pause or Resume exam (P), End session (danger). Watch camera and Mark reviewed stay out in Phase 0.
 * Opens from a click on the StudentTile passed as the trigger, 12 px in from its left edge as in 2.4a.
 */
export function TileActionsMenu({ className, alignOffset = 12, ...props }: TileActionsMenuProps) {
  return <ActionMenu className={cn("w-65", className)} alignOffset={alignOffset} {...props} />;
}

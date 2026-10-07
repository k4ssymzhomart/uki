import { cn } from "../cn.ts";
import { ActionMenu, type ActionMenuProps } from "./action-menu.tsx";

export type TileActionsMenuProps = Omit<ActionMenuProps, "note" | "noteIcon">;

/**
 * Actions for one student on the live wall (Figma Menu/Tile actions 75:2198, frame 2.4a): Open timeline (T),
 * Message (M), Pause or Resume exam (P), End session (danger). Watch camera and Mark reviewed stay out in Phase 0.
 * Opens from a click on the StudentTile passed as the trigger.
 */
export function TileActionsMenu({ className, ...props }: TileActionsMenuProps) {
  return <ActionMenu className={cn("w-65", className)} {...props} />;
}

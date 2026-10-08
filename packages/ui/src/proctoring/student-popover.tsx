import { Popover } from "radix-ui";
import type { ReactElement } from "react";
import { StudentPopoverCard, type StudentPopoverCardProps } from "./student-popover-card.tsx";

export interface StudentPopoverProps extends StudentPopoverCardProps {
  /** The row or tile that opens it. */
  trigger: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Distance from the trigger; 8 px unless set. */
  sideOffset?: number;
  /** Shift along the trigger's edge, for example to line the card up with a row's avatar (1.5a). */
  alignOffset?: number;
  /**
   * Called when the card opens and would take the focus. A card opened by the pointer resting on a row
   * (1.5a) calls preventDefault() here, so hovering never moves the focus.
   */
  onOpenAutoFocus?: (event: Event) => void;
}

/**
 * StudentPopoverCard in a Radix popover. Figma calls it a hover card; it opens on click and on Enter or
 * Space, so its buttons stay reachable by keyboard. A page may also open it while the pointer rests on
 * the row, by controlling `open` (the lobby does, 1.5a).
 */
export function StudentPopover({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  side = "bottom",
  align = "start",
  sideOffset = 8,
  alignOffset = 0,
  onOpenAutoFocus,
  ...card
}: StudentPopoverProps) {
  return (
    <Popover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          asChild
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={16}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <StudentPopoverCard {...card} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

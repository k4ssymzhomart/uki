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
}

/**
 * StudentPopoverCard in a Radix popover. Figma calls it a hover card; it opens on click and on Enter or Space
 * instead, so its buttons stay reachable by keyboard.
 */
export function StudentPopover({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  side = "bottom",
  align = "start",
  ...card
}: StudentPopoverProps) {
  return (
    <Popover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content asChild side={side} align={align} sideOffset={8} collisionPadding={16}>
          <StudentPopoverCard {...card} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

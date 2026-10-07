import { Popover } from "radix-ui";
import type { ReactElement } from "react";
import { ExtendTimePanel, type ExtendTimePanelProps } from "./extend-time-panel.tsx";

export interface ExtendTimePopoverProps extends ExtendTimePanelProps {
  /** The element that opens it, for example the "Extend time" Button on the live wall. */
  trigger: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/** ExtendTimePanel in a Radix popover, opened from its trigger (frame 2.4c). Escape and outside clicks close it. */
export function ExtendTimePopover({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  side = "bottom",
  align = "end",
  ...panel
}: ExtendTimePopoverProps) {
  return (
    <Popover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content asChild side={side} align={align} sideOffset={8} collisionPadding={16}>
          <ExtendTimePanel {...panel} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

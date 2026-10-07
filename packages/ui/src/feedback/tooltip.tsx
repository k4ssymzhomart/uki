import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../cn.ts";

/** Figma: "Shows on hover after 400 ms." */
const OPEN_DELAY_MS = 400;
/** Distance from the trigger: Figma does not place it; space/8 is used. */
const SIDE_OFFSET = 8;

export type TooltipProps = {
  /** The element that shows the tooltip on hover and keyboard focus (rendered with asChild). */
  children: ReactNode;
  /** Tooltip text (Figma Text). */
  content: ReactNode;
  /** Keyboard shortcut after the text, in mono at 60 % (Figma Shortcut). */
  shortcut?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
  className?: string;
};

/** Label for icon-only buttons (Figma Tooltip 79:2411): ink pill with caption text and an optional shortcut. */
export function Tooltip({
  children,
  content,
  shortcut,
  side = "top",
  align = "center",
  open,
  defaultOpen,
  onOpenChange,
  delayDuration = OPEN_DELAY_MS,
  container,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={SIDE_OFFSET}
            className={cn(
              "z-50 flex items-center gap-2 whitespace-nowrap rounded-[calc(var(--radius-sm)-var(--spacing))] bg-inverse px-2.5 py-1.5 text-fg-inverse",
              className,
            )}
          >
            <span className="type-ui-caption">{content}</span>
            {shortcut ? <span className="type-ui-mono opacity-60">{shortcut}</span> : null}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

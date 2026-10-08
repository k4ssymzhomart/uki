import { HoverCard } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Chip, type ChipStatus } from "./chip.tsx";

export type FlagPreviewProps = {
  /** The element that opens the card on hover and keyboard focus, for example a row's flags cell. */
  trigger: ReactElement;
  /**
   * The flagged frame, for example <img src={signedUrl} alt="" className="size-full object-cover" />.
   * Without it the frame shows the empty bg-subtle placeholder, as while a still is loading.
   */
  image?: ReactNode;
  /** The confidence chip: "phone 0.94". */
  chipLabel: ReactNode;
  chipStatus?: ChipStatus;
  /** "10:47:10". */
  time: ReactNode;
  dateTime?: string;
  /** "Madina T. · phone in frame". */
  title: ReactNode;
  /** "Held 6 s. Put away after the warning." */
  detail?: ReactNode;
  /** The link at the bottom, usually "Open review" with an arrow. */
  link?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
  className?: string;
};

/**
 * Popover/Flag preview (Figma 71:2212): a hover card with the flagged frame, what happened and a link to
 * the review. 300 px wide, surface, default stroke, Shadow/Float. It opens on hover and on keyboard focus
 * of its trigger, so the link stays reachable without a mouse.
 */
export function FlagPreview({
  trigger,
  image,
  chipLabel,
  chipStatus = "flag",
  time,
  dateTime,
  title,
  detail,
  link,
  open,
  onOpenChange,
  side = "bottom",
  align = "start",
  container,
  className,
}: FlagPreviewProps) {
  return (
    <HoverCard.Root open={open} onOpenChange={onOpenChange} openDelay={250} closeDelay={150}>
      <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
      <HoverCard.Portal container={container}>
        <HoverCard.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={16}
          className={cn(
            "z-50 flex w-75 flex-col items-start gap-2.5 rounded-md bg-surface px-3 pt-3 pb-3.5 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none",
            className,
          )}
        >
          <div className="h-39 w-full shrink-0 overflow-clip rounded-sm bg-subtle">{image}</div>
          <div className="flex w-full items-center gap-2 overflow-clip px-1">
            <Chip status={chipStatus}>{chipLabel}</Chip>
            <span aria-hidden="true" className="min-w-0 flex-1" />
            <time dateTime={dateTime} className="whitespace-nowrap opacity-55 type-ui-mono">
              {time}
            </time>
          </div>
          <div className="flex w-full flex-col items-start gap-0.5 overflow-clip px-1">
            <p className="type-card-title">{title}</p>
            {detail === undefined ? null : <p className="opacity-62 type-card-caption">{detail}</p>}
          </div>
          {link === undefined ? null : <div className="pl-1">{link}</div>}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

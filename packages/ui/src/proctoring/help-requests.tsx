import { Popover } from "radix-ui";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Avatar } from "../data/avatar.tsx";

/** The reason pill's colour: question on brand-subtle, technical on warn-subtle (Figma 2.4d). */
export type HelpReasonTone = "brand" | "warn";

export interface HelpRequestRowProps extends Omit<ComponentProps<"li">, "children"> {
  /** One or two letters for the lime Avatar, from the student's name. */
  initials: string;
  /** "Kamila R." */
  name: ReactNode;
  /** "Question is unclear". */
  reason: ReactNode;
  reasonTone: HelpReasonTone;
  /** "10:46", the time the request reached the server. */
  time: ReactNode;
  /** The student's note in quotes, or nothing. */
  text?: ReactNode;
  /** Reply (Secondary) and Mark done (Ghost). */
  actions?: ReactNode;
}

/** One request in 2.4d's popover (Figma 155:12221): avatar, name, reason, time, the note and the actions. */
export function HelpRequestRow({
  initials,
  name,
  reason,
  reasonTone,
  time,
  text,
  actions,
  className,
  ...props
}: HelpRequestRowProps) {
  return (
    <li
      className={cn(
        "flex w-full items-start gap-3 overflow-clip border-line-default border-t px-5 pt-3.5 pb-4",
        className,
      )}
      {...props}
    >
      <Avatar tone="lime" initials={initials} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 overflow-clip">
        <div className="flex w-full items-center gap-2 overflow-clip">
          <span className="shrink-0 whitespace-nowrap type-ui-label">{name}</span>
          <span
            data-tone={reasonTone}
            className={cn(
              "shrink-0 overflow-clip whitespace-nowrap rounded-pill px-2 py-0.75 type-ui-mono",
              reasonTone === "brand" ? "bg-brand-subtle" : "bg-warn-subtle",
            )}
          >
            {reason}
          </span>
          <span aria-hidden="true" className="min-w-0 flex-1" />
          <span className="shrink-0 whitespace-nowrap opacity-55 type-ui-mono">{time}</span>
        </div>
        {text ? <p className="w-full type-body-s">{text}</p> : null}
        {actions ? <div className="flex items-start gap-2 overflow-clip">{actions}</div> : null}
      </div>
    </li>
  );
}

export interface HelpRequestsPopoverProps {
  /** The Requests button on the wall's toolbar. */
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "Requests". */
  title: ReactNode;
  /** "2 open", set in Mono/Tag (upper case). */
  count: ReactNode;
  /** "Replies go to one student, in their language." */
  footer: ReactNode;
  /** HelpRequestRow elements, open requests first, oldest first. */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  className?: string;
}

/**
 * The Requests popover of 2.4d (Figma 155:12217): open Ask proctor requests with Reply and Mark done.
 * 420 px wide, surface, card radius, Shadow/Float; a bg/subtle footer.
 */
export function HelpRequestsPopover({
  trigger,
  open,
  onOpenChange,
  title,
  count,
  footer,
  children,
  side = "bottom",
  align = "end",
  sideOffset = 10,
  alignOffset = 0,
  className,
}: HelpRequestsPopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={16}
          className={cn(
            "z-40 flex max-h-(--radix-popover-content-available-height) w-105 max-w-full flex-col items-stretch overflow-clip rounded-card bg-surface text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none",
            className,
          )}
        >
          <div className="flex w-full shrink-0 items-center justify-between overflow-clip px-5 pt-4.5 pb-3">
            <h2 className="whitespace-nowrap type-card-title">{title}</h2>
            <span className="whitespace-nowrap uppercase opacity-60 type-mono-tag">{count}</span>
          </div>
          <ul className="flex min-h-0 w-full flex-col overflow-y-auto">{children}</ul>
          <div className="w-full shrink-0 bg-subtle px-5 pt-3 pb-3.5">
            <p className="opacity-70 type-card-caption">{footer}</p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

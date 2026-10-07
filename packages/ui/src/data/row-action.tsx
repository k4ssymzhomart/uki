import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

export type RowActionProps = ComponentProps<"button"> & {
  /** "message" before the label on Row/Lobby, "arrow-right" after it on Row/Session. */
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** Render the single child (a link) with the action's look instead of a button. */
  asChild?: boolean;
};

/** The text action at the end of a table row: "Message", "Review" (Figma Row/Lobby and Row/Session). */
export function RowAction({
  icon,
  iconPosition = "start",
  asChild = false,
  className,
  children,
  type,
  ...props
}: RowActionProps) {
  const glyph = icon === undefined ? null : <Icon name={icon} className="size-4.5" />;
  const classes = cn(
    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm text-fg-primary outline-none type-label-m focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {iconPosition === "start" ? glyph : null}
        <Slot.Slottable>{children}</Slot.Slottable>
        {iconPosition === "end" ? glyph : null}
      </Slot.Root>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} {...props}>
      {iconPosition === "start" ? glyph : null}
      {children}
      {iconPosition === "end" ? glyph : null}
    </button>
  );
}

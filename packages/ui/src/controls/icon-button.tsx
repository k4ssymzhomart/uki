import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  icon: IconName;
  /** Accessible name; an icon-only button has no visible label. Pair it with <Tooltip> for sighted users. */
  label: string;
};

/**
 * Round 40 px icon button (Figma 45:2059) with a 20 px icon. Figma draws no states for it, so hover,
 * pressed and focus reuse the Button tokens: bg/hover, bg/pressed and the focus ring.
 */
export function IconButton({ icon, label, type, disabled, className, ...props }: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-surface inset-ring inset-ring-line-default",
        "outline-none transition-colors hover:bg-hover active:bg-pressed",
        "focus-visible:shadow-focus focus-visible:inset-ring-2 focus-visible:inset-ring-line-focus",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface",
        className,
      )}
      {...props}
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
}

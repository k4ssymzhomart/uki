import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../cn.ts";

/**
 * outlined: the default-stroked pill of the title bar's language switch (App/Title bar 150:13352).
 * plain: no stroke, as the filter tabs on 0.1 (51:2046), 1.5 (51:2066) and 2.4 (51:2080) draw it.
 */
export type TabGroupVariant = "outlined" | "plain";

export type TabGroupProps = {
  /** The active tab's value; exactly one tab is active. */
  value: string;
  onValueChange?: (value: string) => void;
  /** Tab elements. */
  children: ReactNode;
  /** Accessible name of the group: "Language", "Filter students". */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
  /** outlined (default) or plain. */
  variant?: TabGroupVariant;
  className?: string;
};

/**
 * Segmented tabs on a bg-subtle pill (Figma Tab 40:2060 in a row): outlined in the title bar's language
 * switch, plain in the dashboard's filter rows. Arrow keys move between tabs; choosing the active tab
 * again keeps it.
 */
export function TabGroup({
  value,
  onValueChange,
  children,
  className,
  disabled,
  variant = "outlined",
  ...aria
}: TabGroupProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== "" && next !== value) onValueChange?.(next);
      }}
      data-variant={variant}
      className={cn(
        "inline-flex shrink-0 items-start gap-0.5 overflow-clip rounded-pill bg-subtle p-0.75",
        variant === "outlined" && "inset-ring inset-ring-line-default",
        className,
      )}
      {...aria}
    >
      {children}
    </ToggleGroup.Root>
  );
}

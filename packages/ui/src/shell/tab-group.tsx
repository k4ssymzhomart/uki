import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../cn.ts";

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
  className?: string;
};

/**
 * Segmented tabs on a bg-subtle pill (Figma Tab 40:2060 in a row, as in the title bar's language switch
 * and the lobby filters). Arrow keys move between tabs; choosing the active tab again keeps it.
 */
export function TabGroup({ value, onValueChange, children, className, disabled, ...aria }: TabGroupProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== "" && next !== value) onValueChange?.(next);
      }}
      className={cn(
        "inline-flex shrink-0 items-start gap-0.5 overflow-clip rounded-pill bg-subtle p-0.75 inset-ring inset-ring-line-default",
        className,
      )}
      {...aria}
    >
      {children}
    </ToggleGroup.Root>
  );
}

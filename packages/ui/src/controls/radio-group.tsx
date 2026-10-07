import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

export type RadioGroupProps = ComponentProps<typeof RadioGroupPrimitive.Root>;

/**
 * Group of RadioOption cards: exactly one is selected; arrow keys move and select.
 * Give it an accessible name with aria-label or aria-labelledby. Space between cards is the caller's.
 */
export function RadioGroup({ className, orientation = "vertical", ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      orientation={orientation}
      className={cn("flex", orientation === "vertical" ? "flex-col" : "flex-row", className)}
      {...props}
    />
  );
}

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { barFractions } from "./chart-geometry.ts";

export type ChartBarsItem = {
  key: string;
  /** "Looked away". */
  label: ReactNode;
  /** The share, for the bar's length and the order. */
  value: number;
  /** "46%". */
  valueLabel: ReactNode;
};

export type ChartBarsProps = Omit<ComponentProps<"ul">, "children"> & {
  items: readonly ChartBarsItem[];
  /**
   * `kit` is Chart/Bars (150:2833): bars on a subtle track, the others in ink at 75 %. `quiet` is A.1's
   * "What gets flagged" (102:10709): no track, the others in ink at 14 % with their values at 60 %, and
   * slightly tighter columns.
   */
  variant?: "kit" | "quiet";
};

const VARIANTS = {
  kit: {
    list: "gap-3.5",
    row: "gap-3",
    label: "w-37.5",
    track: "bg-subtle",
    other: "bg-fg-primary/75",
    value: "w-10",
    otherValue: "",
  },
  quiet: {
    list: "gap-3",
    row: "gap-2.5",
    label: "w-35",
    track: "",
    other: "bg-fg-primary/14",
    value: "w-9",
    otherValue: "opacity-60",
  },
} as const;

/**
 * Chart/Bars (Figma 150:2833): horizontal share bars, sorted high to low, the top bar in lime. The top
 * share fills 95 % of its track and the others follow it.
 */
export function ChartBars({ items, variant = "kit", className, ...props }: ChartBarsProps) {
  const style = VARIANTS[variant];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const fractions = barFractions(sorted.map((item) => item.value));
  return (
    <ul className={cn("flex w-full flex-col", style.list, className)} {...props}>
      {sorted.map((item, index) => {
        const top = index === 0;
        return (
          <li key={item.key} className={cn("flex w-full items-center text-fg-primary", style.row)}>
            <span className={cn("shrink-0 truncate type-ui-label", style.label)}>{item.label}</span>
            <span
              aria-hidden
              className={cn("relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-pill", style.track)}
            >
              <span
                className={cn("absolute inset-y-0 left-0 rounded-pill", top ? "bg-brand" : style.other)}
                style={{ width: `${(fractions[index] ?? 0) * 100}%` }}
              />
            </span>
            <span className={cn("shrink-0 text-right type-ui-mono", style.value, !top && style.otherValue)}>
              {item.valueLabel}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

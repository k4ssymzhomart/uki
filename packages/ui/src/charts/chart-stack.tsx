import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { CHART_TONE_BG, type ChartTone } from "./chart-tone.ts";

export type ChartStackSegment = { key: string; tone: ChartTone; value: number };

export type ChartStackProps = Omit<ComponentProps<"div">, "children"> & {
  segments: readonly ChartStackSegment[];
};

/** The outer ends round to 8 (2/3 of radius/sm), the joins to 2 (half a spacing step), as in 102:10745. */
const OUTER_LEFT = "rounded-l-[calc(var(--radius-sm)*2/3)]";
const OUTER_RIGHT = "rounded-r-[calc(var(--radius-sm)*2/3)]";
const INNER_LEFT = "rounded-l-[calc(var(--spacing)/2)]";
const INNER_RIGHT = "rounded-r-[calc(var(--spacing)/2)]";

/**
 * A.1's decisions bar (Figma 102:10745): parts of a whole side by side, 28 high with 3 between them,
 * each as wide as its share. A zero part is left out; without data the row is empty.
 */
export function ChartStack({ segments, className, ...props }: ChartStackProps) {
  const shown = segments.filter((segment) => Number.isFinite(segment.value) && segment.value > 0);
  return (
    <div aria-hidden className={cn("flex h-7 w-full gap-0.75", className)} {...props}>
      {shown.map((segment, index) => (
        <span
          key={segment.key}
          data-segment={segment.key}
          className={cn(
            "h-full min-w-1 basis-0",
            CHART_TONE_BG[segment.tone],
            index === 0 ? OUTER_LEFT : INNER_LEFT,
            index === shown.length - 1 ? OUTER_RIGHT : INNER_RIGHT,
          )}
          style={{ flexGrow: segment.value }}
        />
      ))}
    </div>
  );
}

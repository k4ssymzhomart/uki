import type { ReactNode } from "react";
import { cn } from "../cn.ts";
import { ChartTooltip } from "./chart-tooltip.tsx";

export type ChartHoverTarget = {
  key: string;
  /** The hover area in the chart's user units. */
  x: number;
  y: number;
  width: number;
  height: number;
  tooltip: { date: ReactNode; value: ReactNode };
};

const percent = (value: number, of: number) => `${of > 0 ? (value / of) * 100 : 0}%`;

/**
 * Hover areas over an SVG chart that scales with its width: each area is placed in percent of the
 * chart's size, and its Chart/Tooltip shows above it on hover. Pointer only, since every value is also
 * written on the chart; never printed.
 */
export function ChartHoverLayer({
  targets,
  width,
  height,
}: {
  targets: readonly ChartHoverTarget[];
  width: number;
  height: number;
}) {
  return (
    <div aria-hidden className="absolute inset-0 print:hidden">
      {targets.map((target) => (
        <div
          key={target.key}
          data-hover={target.key}
          className="group absolute"
          style={{
            left: percent(target.x, width),
            top: percent(target.y, height),
            width: percent(target.width, width),
            height: percent(target.height, height),
          }}
        >
          <ChartTooltip
            date={target.tooltip.date}
            value={target.tooltip.value}
            className={cn(
              "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 opacity-0 shadow-float transition-opacity",
              "group-hover:opacity-100",
            )}
          />
        </div>
      ))}
    </div>
  );
}

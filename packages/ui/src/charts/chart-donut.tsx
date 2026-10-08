import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { DONUT, donutPaths } from "./chart-geometry.ts";
import { ChartLegendItem } from "./chart-legend-item.tsx";
import { CHART_TONE_FILL, type ChartTone } from "./chart-tone.ts";

export type ChartDonutSegment = {
  key: string;
  tone: ChartTone;
  value: number;
  /** "No issue". */
  label: ReactNode;
  /** "214 · 72%". */
  valueLabel: ReactNode;
};

export type ChartDonutProps = Omit<ComponentProps<"div">, "children"> & {
  segments: readonly ChartDonutSegment[];
  /** In the middle of the ring: "298". */
  total: ReactNode;
  /** Under it: "flagged sessions". */
  caption: ReactNode;
  /** The ring's accessible name. */
  label: string;
};

/**
 * Chart/Donut (Figma 150:2868): parts of a whole, clockwise from 12 o'clock with 2° gaps, the total in
 * the middle and a Chart/Legend item per part beside the ring. A ring without data stays an empty track.
 */
export function ChartDonut({ segments, total, caption, label, className, ...props }: ChartDonutProps) {
  const paths = donutPaths(segments.map((segment) => segment.value));
  const empty = paths.every((path) => path === "");
  const r = DONUT.size / 2 - DONUT.thickness / 2;
  return (
    <div className={cn("flex items-center gap-7", className)} {...props}>
      <div className="relative size-42 shrink-0">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${DONUT.size} ${DONUT.size}`}
          className="block size-full"
        >
          {empty ? (
            <circle
              cx={DONUT.size / 2}
              cy={DONUT.size / 2}
              r={r}
              fill="none"
              strokeWidth={DONUT.thickness}
              className="stroke-subtle"
            />
          ) : (
            segments.map((segment, index) =>
              paths[index] ? (
                <path
                  key={segment.key}
                  d={paths[index]}
                  fillRule="evenodd"
                  className={CHART_TONE_FILL[segment.tone]}
                />
              ) : null,
            )
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-fg-primary">
          <p className="type-ui-title">{total}</p>
          <p className="type-ui-caption opacity-60">{caption}</p>
        </div>
      </div>
      <div className="flex flex-col items-start gap-3">
        {segments.map((segment) => (
          <ChartLegendItem
            key={segment.key}
            tone={segment.tone}
            label={segment.label}
            value={segment.valueLabel}
          />
        ))}
      </div>
    </div>
  );
}

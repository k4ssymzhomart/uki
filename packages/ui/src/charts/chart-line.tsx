import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import {
  areaPath,
  fitScale,
  linearScale,
  linePath,
  niceTicks,
  type Point,
  spread,
} from "./chart-geometry.ts";
import { ChartHoverLayer, type ChartHoverTarget } from "./chart-hover.tsx";

export type ChartLinePoint = {
  key: string;
  /** Under the point, on the axes variant: "1 Sep". */
  label: string;
  value: number;
  /** "8.4", "1:40". */
  valueLabel: string;
  /** Chart/Tooltip on hover. */
  tooltip?: { date: ReactNode; value: ReactNode };
};

export type ChartLineProps = Omit<ComponentProps<"div">, "children"> & {
  points: readonly ChartLinePoint[];
  /**
   * `axes` is Chart/Line (150:2809): a zero-based value axis with four grid lines, dates under the points,
   * a lime wash under the line and the last value beside its lime point. `spark` is A.1's review time
   * (102:10770): no axes, the line fitted to its values, a brand-subtle area, white points, the first value
   * at 60 % and the last beside its lime point.
   */
  variant?: "axes" | "spark";
  /** The value axis's labels (axes variant): "12". */
  formatTick?: (value: number) => string;
  /** The chart's accessible name: the card's headline. */
  label: string;
};

/**
 * Chart/Line in its own units: the plot runs from x 44 to 500 and from y 16 (top tick) to 196 (zero); the
 * value labels end at x 34 and the dates sit on y 218.4 (the frame's tops plus half a line).
 */
export const LINE_AXES_BOX = {
  width: 540,
  height: 232,
  left: 44,
  right: 500,
  top: 16,
  bottom: 196,
  tickRight: 34,
  dateY: 218.4,
} as const;
/** A.1's review-time plot (102:10770). */
export const LINE_SPARK_BOX = { width: 400, height: 132 } as const;

type Layout = { width: number; height: number; points: Point[]; baseline: number };

function axesLayout(values: readonly number[]) {
  const { left, right, top, bottom } = LINE_AXES_BOX;
  const ticks = niceTicks(Math.max(0, ...values));
  const y = linearScale([0, ticks[ticks.length - 1] ?? 1], [bottom, top]);
  const xs = spread(values.length, left, right);
  return {
    ticks,
    y,
    layout: {
      width: LINE_AXES_BOX.width,
      height: LINE_AXES_BOX.height,
      points: values.map((value, index) => ({ x: xs[index] ?? left, y: y(value) })),
      baseline: bottom,
    } satisfies Layout,
  };
}

function sparkLayout(values: readonly number[]): Layout {
  const { width, height } = LINE_SPARK_BOX;
  const y = fitScale(values, height);
  const xs = spread(values.length, 0, width);
  return {
    width,
    height,
    points: values.map((value, index) => ({ x: xs[index] ?? 0, y: y(value) })),
    baseline: height,
  };
}

/** Hover areas: a column around each point, half-way to its neighbours. */
function hoverTargets(points: readonly ChartLinePoint[], layout: Layout): ChartHoverTarget[] {
  const xs = layout.points.map((point) => point.x);
  return points.flatMap((point, index) => {
    const at = layout.points[index];
    if (!point.tooltip || !at) return [];
    const before = index > 0 ? (at.x + (xs[index - 1] ?? at.x)) / 2 : at.x - 12;
    const after = index < xs.length - 1 ? (at.x + (xs[index + 1] ?? at.x)) / 2 : at.x + 12;
    const top = Math.max(0, at.y - 12);
    return [
      {
        key: point.key,
        x: before,
        y: top,
        width: after - before,
        height: layout.baseline - top,
        tooltip: point.tooltip,
      },
    ];
  });
}

/**
 * Chart/Line (Figma 150:2809): a weekly rate as a line over a lime wash, the last point highlighted in
 * lime with its value. The `spark` variant draws A.1's median review time (102:10770).
 */
export function ChartLine({
  points,
  variant = "axes",
  formatTick = String,
  label,
  className,
  ...props
}: ChartLineProps) {
  const values = points.map((point) => point.value);
  const axes = variant === "axes" ? axesLayout(values) : null;
  const layout = axes ? axes.layout : sparkLayout(values);
  const { width, height, baseline } = layout;
  const coords = layout.points;
  const last = coords[coords.length - 1];
  const first = coords[0];
  const lastPoint = points[points.length - 1];

  return (
    <div className={cn("relative w-full", className)} {...props}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible"
      >
        {axes
          ? axes.ticks.map((tick) => (
              <g key={tick}>
                <rect
                  x={LINE_AXES_BOX.left}
                  y={axes.y(tick)}
                  width={LINE_AXES_BOX.right - LINE_AXES_BOX.left}
                  height={1}
                  className="fill-line-default"
                />
                <text
                  x={LINE_AXES_BOX.tickRight}
                  y={axes.y(tick)}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-fg-primary/50 type-ui-mono"
                >
                  {formatTick(tick)}
                </text>
              </g>
            ))
          : null}
        <path d={areaPath(coords, baseline)} className={axes ? "fill-brand/28" : "fill-brand-subtle"} />
        <path
          d={linePath(coords)}
          fill="none"
          strokeWidth={axes ? 2 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-fg-primary"
        />
        {coords.map((point, index) => {
          const isLast = index === coords.length - 1;
          const key = points[index]?.key ?? String(index);
          if (isLast) {
            return (
              <circle
                key={key}
                cx={point.x}
                cy={point.y}
                r={axes ? 5 : 4}
                strokeWidth={2}
                className="fill-brand stroke-fg-primary"
              />
            );
          }
          return axes ? (
            <circle key={key} cx={point.x} cy={point.y} r={3.5} className="fill-fg-primary" />
          ) : (
            <circle
              key={key}
              cx={point.x}
              cy={point.y}
              r={2}
              strokeWidth={2}
              className="fill-surface stroke-fg-primary"
            />
          );
        })}
        {axes
          ? points.map((point, index) => (
              <text
                key={point.key}
                x={coords[index]?.x}
                y={LINE_AXES_BOX.dateY}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-fg-primary/55 type-ui-mono"
              >
                {point.label}
              </text>
            ))
          : null}
        {!axes && first && coords.length > 1 ? (
          <text
            x={first.x + 10}
            y={first.y - 13.7}
            dominantBaseline="central"
            className="fill-fg-primary/60 type-ui-label"
          >
            {points[0]?.valueLabel}
          </text>
        ) : null}
        {last && lastPoint ? (
          <text
            x={last.x - (axes ? 6 : 3.4)}
            y={Math.max(8.5, last.y - (axes ? 21.5 : 20.4))}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-fg-primary type-ui-label"
          >
            {lastPoint.valueLabel}
          </text>
        ) : null}
      </svg>
      <ChartHoverLayer targets={hoverTargets(points, layout)} width={width} height={height} />
    </div>
  );
}

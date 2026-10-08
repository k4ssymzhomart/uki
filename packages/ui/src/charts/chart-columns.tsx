import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { bands, labelledIndexes, linearScale, niceTicks, roundedTopRect } from "./chart-geometry.ts";
import { ChartHoverLayer, type ChartHoverTarget } from "./chart-hover.tsx";

export type ChartColumn = {
  key: string;
  /** Under the bar: "1 Sep". */
  label: string;
  /** Null draws no bar (a week without sessions). */
  value: number | null;
  /** Over the bar: "11.6". */
  valueLabel: string;
  /** Chart/Tooltip on hover. */
  tooltip?: { date: ReactNode; value: ReactNode };
};

export type ChartColumnsProps = Omit<ComponentProps<"div">, "children"> & {
  columns: readonly ChartColumn[];
  /** The value axis's labels: "12". */
  formatTick: (value: number) => string;
  /** The chart's accessible name: the card's headline. */
  label: string;
};

/** A.1's plot (Figma 102:10678) in its own units; the chart scales with its width. */
export const COLUMNS_BOX = { width: 608, height: 206, left: 32, top: 30, bottom: 180, maxBar: 56 } as const;
const RADIUS = 8;
/** Label centres: the value 11.6 above a bar's top, the date under the zero line (frame tops + half a line). */
const VALUE_ABOVE = 11.6;
const DATE_Y = 196.4;
const TICK_DY = 0.4;

/**
 * A.1's weekly bars (102:10678): flags per 100 sessions per week on a zero-based axis with four grid
 * lines, each bar's value above it, the latest week in lime with its value in UI/Label. Built from the
 * kit's chart parts: the axis and labels of Chart/Line, the tooltip of Chart/Tooltip.
 */
export function ChartColumns({ columns, formatTick, label, className, ...props }: ChartColumnsProps) {
  const { width, height, left, top, bottom, maxBar } = COLUMNS_BOX;
  const values = columns.map((column) => column.value ?? 0);
  const ticks = niceTicks(Math.max(0, ...values));
  const y = linearScale([0, ticks[ticks.length - 1] ?? 1], [bottom, top]);
  const slots = bands(columns.length, left, width - left, maxBar);
  const slot = columns.length > 0 ? (width - left) / columns.length : 0;
  const labelled = new Set(labelledIndexes(columns.length, slot));
  const showValues = slot >= 48;
  const last = columns.length - 1;
  const targets: ChartHoverTarget[] = [];

  const bars = columns.map((column, index) => {
    const band = slots[index];
    if (!band) return null;
    const highlight = index === last;
    const barTop = column.value === null ? bottom : y(column.value);
    if (column.tooltip && column.value !== null) {
      targets.push({
        key: column.key,
        x: band.x,
        y: Math.min(barTop, bottom - RADIUS),
        width: band.width,
        height: bottom - Math.min(barTop, bottom - RADIUS),
        tooltip: column.tooltip,
      });
    }
    return (
      <g key={column.key} data-column={column.key}>
        {column.value === null ? null : (
          <path
            d={roundedTopRect(band.x, barTop, band.width, bottom - barTop, RADIUS)}
            className={highlight ? "fill-brand" : "fill-fg-primary/12"}
          />
        )}
        {column.value !== null && (showValues || highlight) ? (
          <text
            x={band.center}
            y={barTop - VALUE_ABOVE}
            textAnchor="middle"
            dominantBaseline="central"
            className={highlight ? "fill-fg-primary type-ui-label" : "fill-fg-primary/60 type-ui-mono"}
          >
            {column.valueLabel}
          </text>
        ) : null}
        {labelled.has(index) ? (
          <text
            x={band.center}
            y={DATE_Y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-fg-primary/50 type-ui-caption"
          >
            {column.label}
          </text>
        ) : null}
      </g>
    );
  });

  return (
    <div className={cn("relative w-full", className)} {...props}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <rect x={left} y={y(tick)} width={width - left} height={1} className="fill-line-default" />
            <text
              x={0}
              y={y(tick) + TICK_DY}
              dominantBaseline="central"
              className="fill-fg-primary/45 type-ui-mono"
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {bars}
      </svg>
      <ChartHoverLayer targets={targets} width={width} height={height} />
    </div>
  );
}

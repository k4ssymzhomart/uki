import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type ChartTooltipProps = Omit<ComponentProps<"div">, "children"> & {
  /** Mono line on top, at 60 %: "29 Sep". */
  date: ReactNode;
  /** The value: "8.9 flags per 100". */
  value: ReactNode;
};

/**
 * Chart/Tooltip (Figma 150:2889): the hover card of a chart point or bar. Always dark, so it carries
 * the dark theme's surface and text whatever the page's theme is.
 */
export function ChartTooltip({ date, value, className, ...props }: ChartTooltipProps) {
  return (
    <div
      data-theme="dark"
      className={cn(
        "flex flex-col items-start gap-0.5 whitespace-nowrap rounded-sm bg-surface px-3 py-2 text-fg-primary",
        className,
      )}
      {...props}
    >
      <p className="type-ui-mono opacity-60">{date}</p>
      <p className="type-ui-label">{value}</p>
    </div>
  );
}

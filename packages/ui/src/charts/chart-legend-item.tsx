import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { CHART_TONE_BG, type ChartTone } from "./chart-tone.ts";

export type ChartLegendItemProps = Omit<ComponentProps<"div">, "children"> & {
  tone: ChartTone;
  /** "No issue". */
  label: ReactNode;
  /** Mono, at 60 %: "214 · 72%". */
  value?: ReactNode;
  /**
   * `inline` is the kit's row (Chart/Legend item 150:2864): swatch, label and value on one line, 8 apart.
   * `stacked` is A.1's legend (102:10750): swatch and label 6 apart, the value on the line below.
   */
  layout?: "inline" | "stacked";
};

/** Chart/Legend item (Figma 150:2864): an 8 px swatch, the label and the value. */
export function ChartLegendItem({
  tone,
  label,
  value,
  layout = "inline",
  className,
  ...props
}: ChartLegendItemProps) {
  const swatch = <span aria-hidden className={cn("size-2 shrink-0 rounded-pill", CHART_TONE_BG[tone])} />;
  const valueText =
    value === undefined ? null : <span className="whitespace-nowrap type-ui-mono opacity-60">{value}</span>;
  if (layout === "stacked") {
    return (
      <div className={cn("flex flex-col items-start gap-0.5 text-fg-primary", className)} {...props}>
        <span className="flex items-center gap-1.5">
          {swatch}
          <span className="whitespace-nowrap type-ui-label">{label}</span>
        </span>
        {valueText}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2 text-fg-primary", className)} {...props}>
      {swatch}
      <span className="whitespace-nowrap type-ui-label">{label}</span>
      {valueText}
    </div>
  );
}

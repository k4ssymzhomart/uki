/**
 * Series colours of the kit's charts, all from the tokens: the highlighted value in lime (brand), the
 * three review decisions in the status colours (Chart/Donut 150:2868: no issue, talk, committee) and a
 * neutral ink wash for the rest.
 */
export type ChartTone = "brand" | "ok" | "warn" | "flag" | "neutral";

export const CHART_TONE_BG: Readonly<Record<ChartTone, string>> = {
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  flag: "bg-flag",
  neutral: "bg-fg-primary/14",
};

export const CHART_TONE_FILL: Readonly<Record<ChartTone, string>> = {
  brand: "fill-brand",
  ok: "fill-ok",
  warn: "fill-warn",
  flag: "fill-flag",
  neutral: "fill-fg-primary/14",
};

// Development gallery: the kit's Chart parts and A.1's plots next to their Figma screenshots, with the
// frames' sample data. Sample strings are the Figma defaults; this file is not product UI.

import type { ReactNode } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { ChartBars, type ChartBarsItem } from "./chart-bars.tsx";
import { ChartColumns } from "./chart-columns.tsx";
import { ChartDonut, type ChartDonutSegment } from "./chart-donut.tsx";
import { ChartLegendItem } from "./chart-legend-item.tsx";
import { ChartLine, type ChartLinePoint } from "./chart-line.tsx";
import { ChartStack } from "./chart-stack.tsx";
import { ChartTooltip } from "./chart-tooltip.tsx";
import figmaA1Flags from "./figma/102-10674.png";
import figmaA1Types from "./figma/102-10705.png";
import figmaA1Decisions from "./figma/102-10741.png";
import figmaA1Review from "./figma/102-10766.png";
import figmaLine from "./figma/150-2809.png";
import figmaBars from "./figma/150-2833.png";
import figmaLegend from "./figma/150-2864.png";
import figmaDonut from "./figma/150-2868.png";
import figmaTooltip from "./figma/150-2889.png";

export const title = "Charts";
export const order = 6;

export const GALLERY_WEEKS = ["1 Sep", "8 Sep", "15 Sep", "22 Sep", "29 Sep", "6 Oct"] as const;
export const GALLERY_RATES = [11.6, 10.8, 10.1, 9.4, 8.9, 8.4] as const;
const REVIEW_TIMES = [
  [9000, "2:30"],
  [7800, "2:10"],
  [7500, "2:05"],
  [6900, "1:55"],
  [6300, "1:45"],
  [6000, "1:40"],
] as const;

export const GALLERY_TYPES: ChartBarsItem[] = [
  { key: "gaze", label: "Looked away", value: 46, valueLabel: "46%" },
  { key: "phone", label: "Phone in frame", value: 18, valueLabel: "18%" },
  { key: "tab", label: "Tab or site blocked", value: 14, valueLabel: "14%" },
  { key: "face_missing", label: "No face", value: 12, valueLabel: "12%" },
  { key: "face_second", label: "Second face", value: 6, valueLabel: "6%" },
  { key: "camera", label: "Camera lost", value: 4, valueLabel: "4%" },
];

export const GALLERY_DECISIONS: ChartDonutSegment[] = [
  { key: "no_issue", tone: "ok", value: 214, label: "No issue", valueLabel: "214 · 72%" },
  { key: "talk", tone: "warn", value: 61, label: "Talked to the student", valueLabel: "61 · 20%" },
  { key: "committee", tone: "flag", value: 23, label: "Sent to the committee", valueLabel: "23 · 8%" },
];

export const galleryLine: ChartLinePoint[] = GALLERY_WEEKS.map((week, index) => ({
  key: week,
  label: week,
  value: GALLERY_RATES[index] ?? 0,
  valueLabel: String(GALLERY_RATES[index]),
  tooltip: { date: week, value: `${GALLERY_RATES[index]} flags per 100` },
}));

function Specimen({ name, figma, children }: { name: string; figma: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-t border-line-default pt-6" data-specimen={name}>
      <h3 className="type-mono-tag">{name}</h3>
      <div className="flex flex-wrap items-start gap-8">
        <div className="flex flex-col gap-2">
          <span className="opacity-58 type-ui-caption">Figma</span>
          <img src={assetUrl(figma)} alt="" className="max-w-full self-start" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="opacity-58 type-ui-caption">Code</span>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A.1's chart card (102:10674 and its neighbours): the head and the plot. */
function Card({ overline, headline, children }: { overline: string; headline: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line-default bg-surface px-6 pt-5.5 pb-6 text-fg-primary">
      <div className="flex flex-col gap-1">
        <p className="type-mono-tag opacity-50">{overline}</p>
        <p className="type-card-title">{headline}</p>
      </div>
      {children}
    </div>
  );
}

export default function ChartsGallery() {
  return (
    <div className="flex flex-col gap-10">
      <Specimen name="Chart/Line · 150:2809" figma={figmaLine}>
        <div className="w-135" data-figma-node="150:2809">
          <ChartLine points={galleryLine} label="Flags per 100 sessions" />
        </div>
      </Specimen>
      <Specimen name="Chart/Bars · 150:2833" figma={figmaBars}>
        <div className="w-130" data-figma-node="150:2833">
          <ChartBars items={GALLERY_TYPES} />
        </div>
      </Specimen>
      <Specimen name="Chart/Donut · 150:2868" figma={figmaDonut}>
        <div className="w-fit" data-figma-node="150:2868">
          <ChartDonut segments={GALLERY_DECISIONS} total="298" caption="flagged sessions" label="Decisions" />
        </div>
      </Specimen>
      <Specimen name="Chart/Legend item · 150:2864" figma={figmaLegend}>
        <div className="w-fit" data-figma-node="150:2864">
          <ChartLegendItem tone="ok" label="No issue" value="214 · 72%" />
        </div>
      </Specimen>
      <Specimen name="Chart/Tooltip · 150:2889" figma={figmaTooltip}>
        <div className="w-fit" data-figma-node="150:2889">
          <ChartTooltip date="29 Sep" value="8.9 flags per 100" />
        </div>
      </Specimen>
      <Specimen name="A.1 · Flags per week · 102:10674" figma={figmaA1Flags}>
        <div className="w-164" data-figma-node="102:10674">
          <Card overline="Flags per 100 sessions · weekly" headline="Down from 11.6 to 8.4 in six weeks">
            <ChartColumns
              label="Flags per 100 sessions"
              formatTick={String}
              columns={galleryLine.map((point) => ({
                key: point.key,
                label: point.label,
                value: point.value,
                valueLabel: point.valueLabel,
                tooltip: point.tooltip,
              }))}
            />
          </Card>
        </div>
      </Specimen>
      <Specimen name="A.1 · Flag types · 102:10705" figma={figmaA1Types}>
        <div className="w-112" data-figma-node="102:10705">
          <Card overline="What gets flagged" headline="Looking away is almost half">
            <ChartBars items={GALLERY_TYPES} variant="quiet" />
          </Card>
        </div>
      </Specimen>
      <Specimen name="A.1 · Decisions · 102:10741" figma={figmaA1Decisions}>
        <div className="w-164" data-figma-node="102:10741">
          <Card overline="Decisions · 298 flagged sessions" headline="Most flags end as no issue">
            <ChartStack segments={GALLERY_DECISIONS} />
            <div className="flex gap-6">
              {GALLERY_DECISIONS.map((segment) => (
                <ChartLegendItem
                  key={segment.key}
                  tone={segment.tone}
                  label={segment.label}
                  value={segment.valueLabel}
                  layout="stacked"
                />
              ))}
            </div>
            <p className="type-ui-caption opacity-60">Flag ≠ fail. A proctor decides every flag.</p>
          </Card>
        </div>
      </Specimen>
      <Specimen name="A.1 · Review time · 102:10766" figma={figmaA1Review}>
        <div className="w-112" data-figma-node="102:10766">
          <Card overline="Median review time · weekly" headline="Reviews got faster: 2:30 → 1:40">
            <ChartLine
              variant="spark"
              label="Median review time"
              points={REVIEW_TIMES.map(([value, text], index) => ({
                key: String(index),
                label: GALLERY_WEEKS[index] ?? "",
                value,
                valueLabel: text,
                tooltip: { date: GALLERY_WEEKS[index], value: text },
              }))}
            />
          </Card>
        </div>
      </Specimen>
    </div>
  );
}

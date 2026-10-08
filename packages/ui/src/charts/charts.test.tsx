import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartBars } from "./chart-bars.tsx";
import { ChartColumns } from "./chart-columns.tsx";
import { ChartDonut } from "./chart-donut.tsx";
import { ChartLegendItem } from "./chart-legend-item.tsx";
import { ChartLine } from "./chart-line.tsx";
import { ChartStack } from "./chart-stack.tsx";
import { ChartTooltip } from "./chart-tooltip.tsx";
import { GALLERY_DECISIONS, GALLERY_TYPES, galleryLine } from "./charts.gallery.tsx";

const columns = galleryLine.map((point) => ({
  key: point.key,
  label: point.label,
  value: point.value,
  valueLabel: point.valueLabel,
  tooltip: point.tooltip,
}));

describe("ChartColumns (A.1 102:10678)", () => {
  it("draws the axis, a bar per week with its value and date, and the last week in lime", () => {
    const { container } = render(<ChartColumns columns={columns} formatTick={String} label="Flags" />);
    expect(screen.getByRole("img", { name: "Flags" })).toBeTruthy();
    const ticks = [...container.querySelectorAll("text.type-ui-mono")].map((node) => node.textContent);
    expect(ticks.slice(0, 4)).toEqual(["0", "4", "8", "12"]);
    const bars = container.querySelectorAll("[data-column] path");
    expect(bars).toHaveLength(6);
    expect(bars[0]?.getAttribute("d")).toBe("M52 180V43A8 8 0 0 1 60 35H100A8 8 0 0 1 108 43V180Z");
    expect(bars[5]?.getAttribute("class")).toBe("fill-brand");
    expect(bars[0]?.getAttribute("class")).toBe("fill-fg-primary/12");
    expect(screen.getByText("11.6")).toBeTruthy();
    // The date under the bar, and again in its tooltip.
    expect(screen.getAllByText("6 Oct")).toHaveLength(2);
    expect(screen.getByText("8.4").getAttribute("class")).toContain("type-ui-label");
    // Each bar has its tooltip, hidden until hovered.
    expect(container.querySelectorAll("[data-hover]")).toHaveLength(6);
    expect(screen.getByText("8.9 flags per 100")).toBeTruthy();
  });

  it("keeps its grid without data, and leaves a week without sessions empty", () => {
    const { container, rerender } = render(<ChartColumns columns={[]} formatTick={String} label="Flags" />);
    expect(container.querySelectorAll("rect")).toHaveLength(4);
    expect(container.querySelectorAll("[data-column]")).toHaveLength(0);
    rerender(
      <ChartColumns
        columns={[
          { key: "a", label: "1 Sep", value: 2, valueLabel: "2" },
          { key: "b", label: "8 Sep", value: null, valueLabel: "" },
          { key: "c", label: "15 Sep", value: 3, valueLabel: "3" },
        ]}
        formatTick={String}
        label="Flags"
      />,
    );
    expect(container.querySelectorAll("[data-column] path")).toHaveLength(2);
    expect(screen.getByText("8 Sep")).toBeTruthy();
  });
});

describe("ChartLine (150:2809)", () => {
  it("draws Chart/Line's axis, line, area, points and the last value", () => {
    const { container } = render(<ChartLine points={galleryLine} label="Rate" />);
    const paths = container.querySelectorAll("path");
    expect(paths[0]?.getAttribute("class")).toBe("fill-brand/28");
    expect(paths[1]?.getAttribute("d")).toBe("M44 22L135.2 34L226.4 44.5L317.6 55L408.8 62.5L500 70");
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(6);
    expect(circles[5]?.getAttribute("class")).toBe("fill-brand stroke-fg-primary");
    expect(screen.getAllByText("29 Sep")).toHaveLength(2);
    expect(screen.getByText("8.4").getAttribute("text-anchor")).toBe("end");
  });

  it("draws A.1's review time fitted to its values, with the first and last values", () => {
    const { container } = render(
      <ChartLine
        variant="spark"
        label="Review"
        points={[
          { key: "a", label: "1 Sep", value: 9000, valueLabel: "2:30" },
          { key: "b", label: "8 Sep", value: 6000, valueLabel: "1:40" },
        ]}
      />,
    );
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 400 132");
    expect(container.querySelectorAll("path")[1]?.getAttribute("d")).toBe("M0 17.16L400 102.96");
    expect(screen.getByText("2:30").getAttribute("class")).toContain("fill-fg-primary/60");
    expect(screen.getByText("1:40")).toBeTruthy();
    expect(container.querySelectorAll("text")).toHaveLength(2);
  });

  it("draws nothing but its axis without data", () => {
    const { container } = render(<ChartLine points={[]} label="Rate" />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.querySelectorAll("rect")).toHaveLength(4);
    expect(container.querySelectorAll("path")[0]?.getAttribute("d")).toBe("");
  });
});

describe("ChartBars (150:2833)", () => {
  it("sorts high to low and draws the top bar in lime at 95 % of its track", () => {
    const shuffled = [...GALLERY_TYPES].reverse();
    const { container } = render(<ChartBars items={shuffled} />);
    const rows = [...container.querySelectorAll("li")];
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual(
      GALLERY_TYPES.map((item) => item.label),
    );
    const bars = container.querySelectorAll("li > span:nth-child(2) > span");
    expect((bars[0] as HTMLElement).style.width).toBe("95%");
    expect(bars[0]?.className).toContain("bg-brand");
    expect(bars[1]?.className).toContain("bg-fg-primary/75");
  });

  it("drops the track in A.1's quiet variant", () => {
    const { container } = render(<ChartBars items={GALLERY_TYPES} variant="quiet" />);
    const track = container.querySelector("li > span:nth-child(2)");
    expect(track?.className).not.toContain("bg-subtle");
    expect(container.querySelectorAll("li > span:nth-child(2) > span")[1]?.className).toContain(
      "bg-fg-primary/14",
    );
  });

  it("draws empty tracks without data", () => {
    const { container } = render(
      <ChartBars items={[{ key: "a", label: "A", value: 0, valueLabel: "0%" }]} />,
    );
    expect((container.querySelector("li > span:nth-child(2) > span") as HTMLElement).style.width).toBe("0%");
  });
});

describe("ChartDonut (150:2868), ChartStack, ChartLegendItem and ChartTooltip", () => {
  it("draws a segment per decision with the total and the legend", () => {
    const { container } = render(
      <ChartDonut segments={GALLERY_DECISIONS} total="298" caption="flagged sessions" label="Decisions" />,
    );
    const paths = container.querySelectorAll("svg path");
    expect([...paths].map((path) => path.getAttribute("class"))).toEqual([
      "fill-ok",
      "fill-warn",
      "fill-flag",
    ]);
    expect(screen.getByText("298")).toBeTruthy();
    expect(screen.getByText("Talked to the student")).toBeTruthy();
    expect(screen.getByText("23 · 8%")).toBeTruthy();
  });

  it("keeps an empty ring without decisions", () => {
    const { container } = render(
      <ChartDonut
        segments={GALLERY_DECISIONS.map((segment) => ({ ...segment, value: 0 }))}
        total="0"
        caption="flagged sessions"
        label="Decisions"
      />,
    );
    expect(container.querySelectorAll("svg path")).toHaveLength(0);
    expect(container.querySelector("svg circle")?.getAttribute("class")).toBe("stroke-subtle");
  });

  it("sizes the stack's parts by their values and rounds the outer ends", () => {
    const { container } = render(<ChartStack segments={GALLERY_DECISIONS} />);
    const parts = [...container.querySelectorAll("[data-segment]")] as HTMLElement[];
    expect(parts.map((part) => part.style.flexGrow)).toEqual(["214", "61", "23"]);
    expect(parts[0]?.className).toContain("rounded-l-[calc(var(--radius-sm)*2/3)]");
    expect(parts[2]?.className).toContain("rounded-r-[calc(var(--radius-sm)*2/3)]");
    expect(parts[1]?.className).toContain("rounded-r-[calc(var(--spacing)/2)]");
    const { container: empty } = render(<ChartStack segments={[]} />);
    expect(empty.querySelectorAll("[data-segment]")).toHaveLength(0);
  });

  it("lays the legend out inline or stacked, and the tooltip always dark", () => {
    const { container } = render(
      <>
        <ChartLegendItem tone="ok" label="No issue" value="214 · 72%" />
        <ChartLegendItem tone="warn" label="Talk" value="61 · 20%" layout="stacked" />
        <ChartTooltip date="29 Sep" value="8.9 flags per 100" />
      </>,
    );
    expect(container.querySelector(".bg-ok")).toBeTruthy();
    expect(screen.getByText("Talk").parentElement?.parentElement?.className).toContain("flex-col");
    expect(screen.getByText("29 Sep").parentElement?.getAttribute("data-theme")).toBe("dark");
  });
});

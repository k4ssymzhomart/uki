import { describe, expect, it } from "vitest";
import {
  areaPath,
  BAR_TOP_FILL,
  bands,
  barFractions,
  DONUT,
  donutPaths,
  FIT_BAND,
  fitScale,
  labelledIndexes,
  linearScale,
  linePath,
  niceStep,
  niceTicks,
  polar,
  roundedTopRect,
  shares,
  spread,
  tidy,
} from "./chart-geometry.ts";

describe("ticks", () => {
  it("gives A.1's and Chart/Line's axis, 0 to 12, for a top value of 11.6", () => {
    expect(niceTicks(11.6)).toEqual([0, 4, 8, 12]);
  });

  it("picks the smallest nice step that reaches the top", () => {
    expect(niceStep(3.87)).toBe(4);
    expect(niceStep(4)).toBe(4);
    expect(niceStep(4.01)).toBe(5);
    expect(niceStep(0.3)).toBe(0.4);
    expect(niceStep(0.21)).toBe(0.25);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(33)).toBe(40);
    expect(niceTicks(150)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0.5)).toEqual([0, 0.2, 0.4, 0.6]);
  });

  it("keeps four lines without data, and whole steps for counts", () => {
    expect(niceTicks(0)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(-5)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(1.2, 3, 1)).toEqual([0, 1, 2, 3]);
  });

  it("prints steps without binary noise", () => {
    expect(niceTicks(0.7)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(tidy(0.1 + 0.2)).toBe(0.3);
  });
});

describe("scales", () => {
  it("maps a domain onto a range, flipped for SVG's y", () => {
    const y = linearScale([0, 12], [180, 30]);
    expect(y(0)).toBe(180);
    expect(y(12)).toBe(30);
    expect(y(11.6)).toBeCloseTo(35, 6);
    expect(y(8.4)).toBeCloseTo(75, 6);
  });

  it("puts an empty domain in the middle", () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });

  it("fits A.1's review times between 13 % and 78 % of the plot", () => {
    const y = fitScale([9000, 7800, 7500, 6900, 6300, 6000], 132);
    expect(y(9000)).toBeCloseTo(132 * FIT_BAND.top, 6);
    expect(y(6000)).toBeCloseTo(132 * FIT_BAND.bottom, 6);
    expect(y(9000)).toBeCloseTo(17.14, 0);
    expect(y(6000)).toBeCloseTo(102.86, 0);
    expect(y(7800)).toBeCloseTo(51.43, 0);
    expect(fitScale([60, 60], 132)(60)).toBeCloseTo((132 * (FIT_BAND.top + FIT_BAND.bottom)) / 2, 6);
    expect(fitScale([], 132)(0)).toBeCloseTo((132 * (FIT_BAND.top + FIT_BAND.bottom)) / 2, 6);
  });
});

describe("bars and points", () => {
  it("lays A.1's six weeks in 96-wide slots with 56-wide bars", () => {
    const six = bands(6, 32, 576);
    expect(six.map((band) => band.x)).toEqual([52, 148, 244, 340, 436, 532]);
    expect(six.every((band) => band.width === 56)).toBe(true);
    expect(six[0]?.center).toBe(80);
  });

  it("narrows bars when a term has many weeks, and caps them when it has few", () => {
    const many = bands(20, 32, 576);
    expect(many).toHaveLength(20);
    expect(many[0]?.width).toBeCloseTo((28.8 * 7) / 12, 6);
    expect(bands(2, 32, 576)[0]?.width).toBe(56);
    expect(bands(0, 32, 576)).toEqual([]);
  });

  it("labels every slot that has room, else every n-th and always the last", () => {
    expect(labelledIndexes(6, 96)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(labelledIndexes(20, 28.8)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19]);
    expect(labelledIndexes(0, 96)).toEqual([]);
  });

  it("rounds only the top corners, and draws nothing for an empty bar", () => {
    expect(roundedTopRect(52, 35, 56, 145, 8)).toBe("M52 180V43A8 8 0 0 1 60 35H100A8 8 0 0 1 108 43V180Z");
    // A bar lower than its radius gets corners as round as its height allows.
    expect(roundedTopRect(0, 10, 10, 4, 8)).toBe("M0 14V14A4 4 0 0 1 4 10H6A4 4 0 0 1 10 14V14Z");
    expect(roundedTopRect(52, 180, 56, 0, 8)).toBe("");
  });

  it("spreads Chart/Line's six weeks 91.2 apart, and one point in the middle", () => {
    expect(spread(6, 44, 500).map((x) => Math.round(x * 10) / 10)).toEqual([
      44, 135.2, 226.4, 317.6, 408.8, 500,
    ]);
    expect(spread(1, 0, 400)).toEqual([200]);
    expect(spread(0, 0, 400)).toEqual([]);
  });

  it("draws the line and the area under it", () => {
    const points = [
      { x: 0, y: 17.14 },
      { x: 80, y: 51.43 },
      { x: 400, y: 102.86 },
    ];
    expect(linePath(points)).toBe("M0 17.14L80 51.43L400 102.86");
    expect(areaPath(points, 132)).toBe("M0 132L0 17.14L80 51.43L400 102.86L400 132Z");
    expect(linePath([])).toBe("");
    expect(areaPath([], 132)).toBe("");
  });

  it("scales Chart/Bars to the top share", () => {
    expect(barFractions([46, 23, 0])).toEqual([BAR_TOP_FILL, BAR_TOP_FILL / 2, 0]);
    expect(barFractions([])).toEqual([]);
    expect(barFractions([0, 0])).toEqual([0, 0]);
  });
});

describe("shares", () => {
  it("gives A.1's decisions as whole percentages that add up to 100", () => {
    expect(shares([214, 61, 23])).toEqual([72, 20, 8]);
    expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    const types = shares([460, 180, 140, 120, 60, 40]);
    expect(types).toEqual([46, 18, 14, 12, 6, 4]);
    expect(types.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("gives zeros without data", () => {
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });
});

describe("donut", () => {
  it("measures angles clockwise from 12 o'clock", () => {
    const top = polar(84, 84, 84, 0);
    expect(top.x).toBeCloseTo(84, 6);
    expect(top.y).toBeCloseTo(0, 6);
    const right = polar(84, 84, 84, 90);
    expect(right.x).toBeCloseTo(168, 6);
    expect(right.y).toBeCloseTo(84, 6);
  });

  it("starts the first segment 1° after 12 o'clock and leaves 2° between segments", () => {
    const [noIssue, talk, committee] = donutPaths([214, 61, 23]);
    const start = polar(84, 84, 84, 1);
    expect(
      noIssue?.startsWith(`M${Math.round(start.x * 100) / 100} ${Math.round(start.y * 100) / 100}`),
    ).toBe(true);
    // 72 % of the ring is more than half a turn: the large-arc flag is set.
    expect(noIssue).toContain("A84 84 0 1 1");
    expect(noIssue).toContain(`A${84 - DONUT.thickness} ${84 - DONUT.thickness} 0 1 0`);
    expect(talk).toContain("A84 84 0 0 1");
    expect(committee).toContain("A84 84 0 0 1");
    const end = (214 / 298) * 360 + 1;
    const talkStart = polar(84, 84, 84, end);
    expect(talk?.startsWith(`M${Math.round(talkStart.x * 100) / 100} `)).toBe(true);
  });

  it("draws nothing for zero values, and the whole ring for a single value", () => {
    expect(donutPaths([0, 0, 0])).toEqual(["", "", ""]);
    const [only, none] = donutPaths([5, 0]);
    expect(none).toBe("");
    expect(only).toBe(
      "M84 0A84 84 0 1 1 84 168A84 84 0 1 1 84 0ZM84 22A62 62 0 1 1 84 146A62 62 0 1 1 84 22Z",
    );
  });
});

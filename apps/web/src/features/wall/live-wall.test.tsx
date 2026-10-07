import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DANA, renderWithIntl } from "../../../test/render.tsx";
import { LiveWall } from "./live-wall.tsx";
import { fakeClient, initialData, NOW, setupDom } from "./test-helpers.tsx";

setupDom();

const db = fakeClient();
const getClient = () => db.client;
/** The server answered with this browser's own time. */
const inStep = async () => 0;
/** The server answered 3 minutes behind this browser. */
const threeMinutesFast = async () => -3 * 60_000;

describe("2.4 Live wall clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not take the page's load time for clock skew", async () => {
    // The page rendered 4 s before it hydrated (slow queries, a loaded laptop); the clock is right.
    vi.setSystemTime(NOW);
    const initial = { ...initialData(), serverNowMs: NOW - 4000 };
    renderWithIntl(<LiveWall initial={initial} getClient={getClient} measureOffset={inStep} />, DANA);
    expect(await screen.findByText("Live / Mathematics 2 · Midterm · 00:42:17 left")).toBeTruthy();
  });

  it("corrects a browser clock that runs fast by the measured offset", async () => {
    vi.setSystemTime(NOW + 3 * 60_000);
    renderWithIntl(
      <LiveWall initial={initialData()} getClient={getClient} measureOffset={threeMinutesFast} />,
      DANA,
    );
    expect(await screen.findByText("Live / Mathematics 2 · Midterm · 00:42:17 left")).toBeTruthy();
  });
});

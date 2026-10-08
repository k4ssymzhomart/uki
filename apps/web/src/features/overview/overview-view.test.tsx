import { fireEvent, screen, within } from "@testing-library/react";
import { DEFAULT_EXAM_CHECKS } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import { DANA, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { type OverviewRow, parseOverviewRows } from "./overview-model.ts";
import { OverviewView } from "./overview-view.tsx";

vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Wednesday 7 October 2026, 15:00 in Almaty.
const now = Date.parse("2026-10-07T10:00:00Z");

function exam(
  n: number,
  title: string,
  status: OverviewRow["status"],
  startsAt: string,
  extra: Partial<OverviewRow>,
) {
  return {
    id: `e0000000-0000-4000-8000-00000000000${n}`,
    title,
    course: title.split(" · ")[0] ?? title,
    status,
    starts_at: startsAt,
    duration_min: 90,
    lobby_opens_at: new Date(Date.parse(startsAt) - 20 * 60_000).toISOString(),
    checks: DEFAULT_EXAM_CHECKS,
    groups: ["204"],
    proctor_count: 1,
    roster_size: 100,
    joined: 0,
    writing: 0,
    flagged_events: 0,
    sessions_final: 0,
    ...extra,
  };
}

const rows = parseOverviewRows([
  exam(1, "Mathematics 2 · Midterm", "scheduled", "2026-10-09T05:00:00Z", {
    proctor_count: 2,
    roster_size: 128,
  }),
  exam(2, "Physics 1 · Quiz 3", "live", "2026-10-07T09:00:00Z", {
    groups: ["101", "102", "103"],
    proctor_count: 3,
    roster_size: 86,
    joined: 86,
  }),
  exam(3, "History of Kazakhstan · Test", "to_review", "2026-10-07T06:00:00Z", {
    groups: ["110"],
    flagged_events: 7,
  }),
  exam(4, "Linear Algebra · Final", "draft", "2026-10-13T04:00:00Z", {
    groups: ["101", "102", "103", "204"],
    proctor_count: 4,
  }),
  exam(5, "English B2 · Reading", "reviewed", "2026-10-03T10:00:00Z", { groups: ["301"] }),
]);

function renderOverview() {
  return renderWithIntl(
    <OverviewView rows={rows} groupCount={4} readiness={{ ready: 128, total: 128 }} nowMs={now} />,
    DANA,
  );
}

describe("0.1 Overview", () => {
  it("shows the stat cards from exam_overview, with 0 MB of video", () => {
    const { container } = renderOverview();
    expect(screen.getByText("Next: Mathematics 2 · Fri 10:00")).toBeTruthy();
    expect(screen.getByText("Physics 1 · Quiz 3", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("0 MB")).toBeTruthy();
    expect(screen.getByText("Events and flagged frames only")).toBeTruthy();
    expect(screen.getByText("KRU · Faculty of Mathematics")).toBeTruthy();
    expect(rawKeys(container)).toEqual([]);
  });

  it("writes each row as Figma does, in Asia/Almaty", () => {
    renderOverview();
    const rowOf = (title: string) => screen.getByRole("link", { name: title }).closest("tr") as HTMLElement;
    expect(within(rowOf("Mathematics 2 · Midterm")).getByText("Group 204 · 2 proctors")).toBeTruthy();
    expect(within(rowOf("Mathematics 2 · Midterm")).getByText("Fri 9 Oct · 10:00")).toBeTruthy();
    expect(within(rowOf("Physics 1 · Quiz 3")).getByText("Groups 101–103 · 3 proctors")).toBeTruthy();
    expect(within(rowOf("Physics 1 · Quiz 3")).getByText("Today · 14:00")).toBeTruthy();
    expect(within(rowOf("Physics 1 · Quiz 3")).getByText("Live now")).toBeTruthy();
    expect(within(rowOf("History of Kazakhstan · Test")).getByText("7 flags to review")).toBeTruthy();
    expect(within(rowOf("Linear Algebra · Final")).getByText("All groups · 4 proctors")).toBeTruthy();
    expect(within(rowOf("Mathematics 2 · Midterm")).getByRole("link").getAttribute("href")).toBe(
      "/exams/e0000000-0000-4000-8000-000000000001/lobby",
    );
    expect(within(rowOf("Physics 1 · Quiz 3")).getByRole("link").getAttribute("href")).toBe(
      "/exams/e0000000-0000-4000-8000-000000000002/live",
    );
  });

  it("filters the exams table on the client", () => {
    renderOverview();
    const titles = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("a")?.textContent);
    expect(titles()).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Done" }));
    expect(titles()).toEqual(["History of Kazakhstan · Test", "English B2 · Reading"]);
    fireEvent.click(screen.getByRole("radio", { name: "Upcoming" }));
    expect(titles()).toEqual(["Mathematics 2 · Midterm", "Linear Algebra · Final"]);
    fireEvent.click(screen.getByRole("radio", { name: "Live" }));
    expect(titles()).toEqual(["Physics 1 · Quiz 3"]);
  });

  it("opens the next exam's lobby from its card, and hides Import CSV", () => {
    renderOverview();
    expect(screen.getByText("Mathematics 2 · 10:00")).toBeTruthy();
    expect(screen.getByText("Lobby opens at 09:40. 128 students, 2 proctors.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open lobby" }).getAttribute("href")).toBe(
      "/exams/e0000000-0000-4000-8000-000000000001/lobby",
    );
    expect(screen.getByText("Before Friday")).toBeTruthy();
    expect(screen.queryByText("Import CSV")).toBeNull();
  });

  it("gives the exam office New exam (WP 1.3) and opens a draft in its wizard", () => {
    renderOverview();
    expect(screen.getByRole("button", { name: "New exam" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Linear Algebra · Final" }).getAttribute("href")).toBe(
      "/exams/e0000000-0000-4000-8000-000000000004/edit/details",
    );
  });

  it("shows a proctor no New exam, and a draft's row still leads to its lobby", () => {
    renderWithIntl(<OverviewView rows={rows} groupCount={4} readiness={null} nowMs={now} />, {
      ...DANA,
      role: "proctor",
    });
    expect(screen.queryByRole("button", { name: "New exam" })).toBeNull();
    expect(screen.getByRole("link", { name: "Linear Algebra · Final" }).getAttribute("href")).toBe(
      "/exams/e0000000-0000-4000-8000-000000000004/lobby",
    );
  });

  it("links the exam office to the next exam's roster when an invite bounced (0.3b)", () => {
    renderWithIntl(
      <OverviewView rows={rows} groupCount={4} readiness={{ ready: 127, total: 128 }} nowMs={now} />,
      DANA,
    );
    expect(screen.getByRole("link", { name: "Fix 1 address" }).getAttribute("href")).toBe(
      "/exams/e0000000-0000-4000-8000-000000000001/edit/roster",
    );
    renderOverview();
    expect(screen.getAllByRole("link", { name: /^Fix \d+ address/ })).toHaveLength(1);
  });

  it("gives a proctor no roster link", () => {
    renderWithIntl(
      <OverviewView rows={rows} groupCount={4} readiness={{ ready: 127, total: 128 }} nowMs={now} />,
      { ...DANA, role: "proctor" },
    );
    expect(screen.queryByRole("link", { name: "Fix 1 address" })).toBeNull();
  });
});

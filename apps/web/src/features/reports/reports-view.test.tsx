import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { setOverviewFaculty } from "../shell/preferences.ts";
import { ReportsView } from "./reports-view.tsx";
import { EMPTY_DATA, FACULTIES, FRAME_DATA, MATH, PHYSICS } from "./test-fixtures.ts";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../shell/preferences.ts", () => ({ setOverviewFaculty: vi.fn(async () => ({ ok: true })) }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
});

function renderReports(data = FRAME_DATA, facultyId: string | null = MATH) {
  return renderWithIntl(
    <ReportsView data={data} faculties={FACULTIES} facultyId={facultyId} workspaceName="KRU · Kostanay" />,
    DANA,
  );
}

function openMenu(name: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name }), { button: 0, ctrlKey: false });
}

describe("A.1 Reports", () => {
  it("draws the frame's pickers, tiles and cards with its numbers and headlines", () => {
    const { container } = renderReports();
    const text = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeTruthy();
    expect(text).toContain("Reports / Autumn term 2026");
    expect(screen.getByRole("button", { name: "Term" }).textContent).toBe("Autumn term 2026");
    expect(screen.getByRole("button", { name: "Faculty" }).textContent).toBe("Faculty of Mathematics");
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeTruthy();
    for (const tile of [
      "Exams run38since 1 Sep",
      "Sessions4,912students × exams",
      "Flags per 1008.4down from 10.5 in Sep",
      "To committee0.5%23 of 4,912 sessions",
    ]) {
      expect(text).toContain(tile);
    }
    expect(screen.getByRole("img", { name: "Down from 11.6 to 8.4 in six weeks" })).toBeTruthy();
    expect(text).toContain("Flags per 100 sessions · weekly");
    expect(text).toContain("Looking away is almost half");
    expect(text).toContain("Looked away46%");
    expect(text).toContain("Camera lost4%");
    expect(text).toContain("Decisions · 298 flagged sessions");
    expect(text).toContain("Most flags end as no issue");
    expect(text).toContain("No issue214 · 72%");
    expect(text).toContain("Talked to the student61 · 20%");
    expect(text).toContain("Sent to the committee23 · 8%");
    expect(text).toContain("Flag ≠ fail. A proctor decides every flag.");
    expect(screen.getByRole("img", { name: "Reviews got faster: 2:30 → 1:40" })).toBeTruthy();
    // The weekly bars: six weeks, the latest in lime.
    const bars = container.querySelectorAll('[data-chart="weekly"] [data-column] path');
    expect(bars).toHaveLength(6);
    expect(bars[5]?.getAttribute("class")).toBe("fill-brand");
    // The decisions bar: one part per decision, sized by its count.
    const parts = [...container.querySelectorAll('[data-chart="decisions"] [data-segment]')] as HTMLElement[];
    expect(parts.map((part) => part.style.flexGrow)).toEqual(["214", "61", "23"]);
    // Phase 2 and 3 entry points stay hidden: no exam filter, no search, no bell.
    expect(screen.queryByRole("button", { name: /All exams/ })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("prints the page from Export PDF, with the workspace and faculty on the printout", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderReports();
    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-print-root]")?.textContent).toContain(
      "KRU · Kostanay · Faculty of Mathematics",
    );
    print.mockRestore();
  });

  it("puts the chosen term in the address and the chosen faculty in the workspace menu's cookie", async () => {
    renderReports(FRAME_DATA, null);
    expect(screen.getByRole("button", { name: "Faculty" }).textContent).toBe("All faculties");
    openMenu("Term");
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Spring term 2026" }));
    expect(router.push).toHaveBeenCalledWith("/reports?term=2026-spring");
    openMenu("Faculty");
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Faculty of Physics" }));
    });
    expect(setOverviewFaculty).toHaveBeenCalledWith(PHYSICS);
  });

  it("keeps every card for a term without exams, with dashes and the empty headlines", () => {
    const { container } = renderReports(EMPTY_DATA, null);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Reports / Spring term 2027");
    expect(text).toContain("Exams run0since 1 Feb");
    expect(text).toContain("Flags per 100–");
    expect(text).toContain("To committee–0 of 0 sessions");
    expect(text).toContain("No exams yet this term");
    expect(text).toContain("No flags yet this term");
    expect(text).toContain("No decisions yet this term");
    expect(text).toContain("No reviews yet this term");
    expect(container.querySelectorAll('[data-chart="weekly"] [data-column]')).toHaveLength(0);
  });
});

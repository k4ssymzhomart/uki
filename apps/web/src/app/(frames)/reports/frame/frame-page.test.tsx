// The development-only route /reports/frame (A.1 with the frame's numbers for the Figma comparison)
// answers 404 in production, and in development draws A.1 inside the shell with Reports marked.
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DANA, renderWithIntl } from "../../../../../test/render.tsx";
import ReportsFramePage from "./page.tsx";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/reports/frame",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../../../features/shell/preferences.ts", () => ({
  setOverviewFaculty: vi.fn(),
  setDashboardLocale: vi.fn(),
}));
vi.mock("../../../../features/shell/sign-out.ts", () => ({ signOut: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/reports/frame", () => {
  it("answers 404 in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => ReportsFramePage()).toThrow(
      expect.objectContaining({ digest: expect.stringContaining("404") }),
    );
  });

  it("draws A.1 with the frame's numbers in the shell, Reports marked, in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderWithIntl(ReportsFramePage() as ReactElement, DANA);
    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeTruthy();
    expect(document.body.textContent).toContain("Sessions4,912students × exams");
    expect(screen.getByRole("link", { name: /Reports/ }).getAttribute("aria-current")).toBe("page");
  });
});

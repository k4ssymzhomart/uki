import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { retryHref, StaffLookupFailed } from "./staff-lookup-failed.tsx";

const location = vi.hoisted(() => ({ pathname: "/overview", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));

const EXAM = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690001";
const SESSION = "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690002";

describe("retryHref", () => {
  it("keeps the query, so the drawer a proctor had open comes back", () => {
    expect(retryHref("/overview", "")).toBe("/overview");
    expect(retryHref(`/exams/${EXAM}/live`, `session=${SESSION}`)).toBe(
      `/exams/${EXAM}/live?session=${SESSION}`,
    );
  });
});

describe("StaffLookupFailed", () => {
  beforeEach(() => {
    location.pathname = "/overview";
    location.search = "";
  });

  it("shows the error with a Try again link to this same page, never to sign-in", () => {
    location.pathname = `/exams/${EXAM}/live`;
    location.search = `session=${SESSION}`;
    const { container } = renderWithIntl(<StaffLookupFailed />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Could not reach Üki");
    expect(alert.textContent).toContain("Your account did not load");
    const retry = screen.getByRole("link", { name: "Try again" });
    expect(retry.getAttribute("href")).toBe(`/exams/${EXAM}/live?session=${SESSION}`);
    expect(container.querySelector('a[href="/sign-in"]')).toBeNull();
    expect(rawKeys(container)).toEqual([]);
  });

  it("fills the screen when the layout shows it without the shell", () => {
    const { container } = renderWithIntl(<StaffLookupFailed standalone />);
    expect(container.querySelector("main")?.className).toContain("min-h-screen");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/overview");
  });
});

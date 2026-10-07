import { act, cleanup, render, screen } from "@testing-library/react";
import { LOCALES, loadMessages } from "@uki/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockIntlProvider } from "../lib/intl.tsx";
import type { BarState } from "../lib/state.ts";
import { LockOverlay, TOAST_MS } from "./lock-overlay.tsx";

const NOW = Date.parse("2026-10-07T09:13:46Z");
const bar: BarState = {
  mode: "browser",
  title: "Physics 1 · Quiz 3",
  starts_at: "2026-10-07T09:00:00Z",
  ends_at: "2026-10-07T09:40:00Z",
  phase: "writing",
  watch: "watching",
  locale: "kk",
  lms_url: "http://localhost:5180/physics-1/quiz-3",
  allowed_hosts: ["localhost:5180"],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe.each(LOCALES)("the Lock bar and toast in %s", (locale) => {
  const m = loadMessages(locale);

  it("shows the exam, the time left and the watch label, then the E.6 toast for 2.5 s", () => {
    const { rerender } = render(
      <LockIntlProvider locale={locale}>
        <LockOverlay bar={bar} toast={null} locale={locale} />
      </LockIntlProvider>,
    );
    expect(screen.getByText("Physics 1 · Quiz 3")).toBeTruthy();
    expect(screen.getByText("26:14")).toBeTruthy();
    expect(screen.getByText(m.exam.timer.left)).toBeTruthy();
    expect(screen.getByText(m.lock.watching)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    rerender(
      <LockIntlProvider locale={locale}>
        <LockOverlay bar={bar} toast={{ id: 1, at: NOW }} locale={locale} />
      </LockIntlProvider>,
    );
    expect(screen.getByText(m.lock.copy.toast)).toBeTruthy();
    expect(screen.getByText(m.lock.copy.noted.replace("{time}", "14:13"))).toBeTruthy();
    const wrapper = screen.getByRole("status").parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("false");
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });
});

it("stops the clock while the exam is paused", () => {
  const { rerender } = render(
    <LockIntlProvider locale="en">
      <LockOverlay bar={{ ...bar, phase: "paused" }} toast={null} locale="en" />
    </LockIntlProvider>,
  );
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByText("26:14")).toBeTruthy();
  rerender(
    <LockIntlProvider locale="en">
      <LockOverlay bar={{ ...bar, phase: "writing" }} toast={null} locale="en" />
    </LockIntlProvider>,
  );
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("26:08")).toBeTruthy();
});

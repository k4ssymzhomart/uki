import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe.each(LOCALES)("E.5a Ask proctor in the bar, in %s", (locale) => {
  const m = loadMessages(locale);
  const ID = "0199a000-0000-7000-8000-000000000a5a";

  it("opens the sheet, sends the reason and the note, waits for help.queued and confirms", async () => {
    const onAskHelp = vi.fn(async () => ID);
    const view = (state: BarState) => (
      <LockIntlProvider locale={locale}>
        <LockOverlay bar={state} toast={null} locale={locale} onAskHelp={onAskHelp} />
      </LockIntlProvider>
    );
    const { rerender } = render(view(bar));
    const ask = screen.getByRole("button", { name: m.action.ask_proctor });
    expect(ask.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(ask);
    expect(screen.getByRole("button", { name: m.action.ask_proctor }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    const sheet = screen.getByRole("dialog", { name: m.lock.ask.title });
    expect(
      within(sheet)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual([
      m.lock.ask.reason.unclear,
      m.lock.ask.reason.technical,
      m.lock.ask.reason.break,
      m.lock.ask.reason.other,
    ]);
    fireEvent.click(within(sheet).getByRole("radio", { name: m.lock.ask.reason.technical }));
    fireEvent.change(within(sheet).getByLabelText(m.lock.ask.note.label), {
      target: { value: "The calculator tab doesn’t open." },
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: m.lock.ask.send }));
    });
    expect(onAskHelp).toHaveBeenCalledWith("technical", "The calculator tab doesn’t open.");
    expect(sheet.getAttribute("data-state")).toBe("sent");
    // The app answered help.queued: the service worker marks it on the bar, and the sheet confirms.
    rerender(view({ ...bar, help: { id: ID, at: NOW, queued: true } }));
    expect(screen.getByRole("dialog", { name: m.lock.ask.title }).getAttribute("data-state")).toBe("queued");
    expect(screen.getByText(m.identity.help.requested.replace("{time}", "14:13"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.message.ack }));
    expect(screen.queryByRole("dialog", { name: m.lock.ask.title })).toBeNull();
  });
});

it("hides Ask proctor without a sender and on the block page of an app exam", () => {
  render(
    <LockIntlProvider locale="en">
      <LockOverlay bar={bar} toast={null} locale="en" />
    </LockIntlProvider>,
  );
  expect(screen.queryByRole("button", { name: "Ask proctor" })).toBeNull();
  cleanup();
  render(
    <LockIntlProvider locale="en">
      <LockOverlay bar={{ ...bar, mode: "app" }} toast={null} locale="en" onAskHelp={async () => null} />
    </LockIntlProvider>,
  );
  expect(screen.queryByRole("button", { name: "Ask proctor" })).toBeNull();
});

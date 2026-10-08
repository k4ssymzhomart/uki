import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_BROWSER_RULES } from "@uki/contracts";
import { LOCALES, loadMessages } from "@uki/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockIntlProvider } from "../../lib/intl.tsx";
import type { BarState } from "../../lib/state.ts";
import { BlockedPage } from "./blocked-page.tsx";

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
const AT = Date.parse("2026-10-07T09:18:40Z");

afterEach(cleanup);

describe.each(LOCALES)("blocked.html in %s", (locale) => {
  const m = loadMessages(locale);

  it("E.7: the bar, why, the host and time, and Back to the exam", () => {
    const onBack = vi.fn();
    render(
      <LockIntlProvider locale={locale}>
        <BlockedPage
          bar={{ ...bar, locale }}
          host="wikipedia.org"
          attemptAt={AT}
          locale={locale}
          onBack={onBack}
        />
      </LockIntlProvider>,
    );
    expect(screen.getByRole("heading", { name: m.lock.blocked.title })).toBeTruthy();
    // Every rule is on without browser_rules, the calculator too.
    expect(screen.getByText(m.lock.blocked.body.full)).toBeTruthy();
    expect(screen.getByText("wikipedia.org · 14:18:40")).toBeTruthy();
    expect(screen.getByText(m.lock.badge)).toBeTruthy();
    expect(screen.getByText(m.lock.watching)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.lock.blocked.back }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("exams in the app: the title line only", () => {
    render(
      <LockIntlProvider locale={locale}>
        <BlockedPage
          bar={{ ...bar, mode: "app" }}
          host={null}
          attemptAt={AT}
          locale={locale}
          onBack={() => {}}
        />
      </LockIntlProvider>,
    );
    expect(screen.getByRole("heading").textContent).toBe(m.lock.blocked.title);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

it("says only the portal is open when E.1's calculator rule is off, and has no Calculator tab", () => {
  const m = loadMessages("en");
  render(
    <LockIntlProvider locale="en">
      <BlockedPage
        bar={{ ...bar, browser_rules: { ...DEFAULT_BROWSER_RULES, calculator: false } }}
        host="wikipedia.org"
        attemptAt={AT}
        locale="en"
        onBack={() => {}}
      />
    </LockIntlProvider>,
  );
  expect(screen.getByText(m.lock.blocked.body.portal_only)).toBeTruthy();
  expect(screen.queryByRole("button", { name: m.lock.tab.calculator })).toBeNull();
});

it("opens E.5b from the Calculator tab and goes back to the block page from the portal tab", () => {
  const m = loadMessages("en");
  const onBack = vi.fn();
  render(
    <LockIntlProvider locale="en">
      <BlockedPage
        bar={{ ...bar, student_name: "Aliya Seitkali" }}
        host="wikipedia.org"
        attemptAt={AT}
        locale="en"
        onBack={onBack}
      />
    </LockIntlProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: m.lock.tab.calculator }));
  expect(screen.getByRole("heading", { name: m.lock.calc.title })).toBeTruthy();
  expect(screen.getByText("AS")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: m.lock.blocked.title })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: m.lock.tab.portal }));
  expect(screen.getByRole("heading", { name: m.lock.blocked.title })).toBeTruthy();
  expect(onBack).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: m.lock.tab.portal }));
  expect(onBack).toHaveBeenCalledOnce();
});

it("shows the phone label while the app's phone warning is up", () => {
  render(
    <LockIntlProvider locale="en">
      <BlockedPage
        bar={{ ...bar, watch: "phone_found" }}
        host={null}
        attemptAt={AT}
        locale="en"
        onBack={() => {}}
      />
    </LockIntlProvider>,
  );
  expect(screen.getByText(loadMessages("en").exam.phone.title)).toBeTruthy();
});

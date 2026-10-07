import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LockExam } from "@uki/contracts";
import { LOCALES, type Locale, loadMessages } from "@uki/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockIntlProvider } from "../../lib/intl.tsx";
import { EMPTY_VIEW, type LockView } from "../../lib/state.ts";
import { type PopupActions, PopupApp, popupScreen } from "./popup-app.tsx";

const NOW = Date.parse("2026-10-07T09:22:00Z");
const exam: LockExam = {
  session_id: "0192f3a0-0000-7000-8000-000000000001",
  mode: "browser",
  title: "Physics 1 · Quiz 3",
  starts_at: "2026-10-07T09:00:00Z",
  ends_at: "2026-10-07T09:40:00Z",
  allowed_hosts: ["localhost:5180"],
  lms_url: "http://localhost:5180/physics-1/quiz-3",
  done_path: "/physics-1/quiz-3/review",
};
const app = { os: "windows" as const, student_name: "Aliya S.", app_version: "0.1.0" };

const VIEWS: Record<string, LockView> = {
  open_app: EMPTY_VIEW,
  pair: {
    ...EMPTY_VIEW,
    link: "connected",
    app,
    pair: { code: "482913", expires_at: "2026-10-07T09:24:00.000Z" },
  },
  paired: { ...EMPTY_VIEW, link: "paired", app },
  ready: {
    ...EMPTY_VIEW,
    link: "paired",
    app,
    exam_state: { type: "exam.state", phase: "ready", watch: "watching", locale: "kk", exam },
  },
  locked: {
    ...EMPTY_VIEW,
    link: "paired",
    app,
    locked: { mode: "browser", exam, started_at: NOW, locale: "kk" },
  },
  released: {
    ...EMPTY_VIEW,
    link: "paired",
    released: {
      trigger: "done_path",
      mode: "browser",
      released_at: Date.parse("2026-10-07T09:38:00Z"),
      started_at: Date.parse("2026-10-07T09:00:00Z"),
      tabs_restored: 3,
      blocked_count: 3,
      locale: "kk",
    },
  },
};

function actions(): PopupActions {
  return { pair: vi.fn(), confirm: vi.fn(), lock: vi.fn(), dismiss: vi.fn() };
}

function show(view: LockView, locale: Locale, handlers = actions()) {
  render(
    <LockIntlProvider locale={locale}>
      <PopupApp
        view={view}
        productName="Üki Lock"
        otherTabs={3}
        nowMs={NOW}
        locale={locale}
        actions={handlers}
      />
    </LockIntlProvider>,
  );
  return handlers;
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  errors.mockRestore();
});

describe("popupScreen", () => {
  it("picks the state from the view", () => {
    expect(
      Object.fromEntries(Object.entries(VIEWS).map(([name, view]) => [name, popupScreen(view)])),
    ).toEqual({
      open_app: "open_app",
      pair: "pair",
      paired: "paired",
      ready: "ready",
      locked: "locked",
      released: "released",
    });
    const appExam = { ...exam, mode: "app" as const };
    expect(
      popupScreen({
        ...VIEWS.ready,
        exam_state: { type: "exam.state", phase: "ready", watch: "watching", locale: "kk", exam: appExam },
      } as LockView),
    ).toBe("paired");
  });
});

describe.each(LOCALES)("the popup in %s", (locale) => {
  const m = loadMessages(locale).lock;

  it.each(Object.keys(VIEWS))("renders %s from catalog messages only", (name) => {
    const { container } = render(
      <LockIntlProvider locale={locale}>
        <PopupApp
          view={VIEWS[name] as LockView}
          productName="Üki Lock"
          otherTabs={3}
          nowMs={NOW}
          locale={locale}
          actions={actions()}
        />
      </LockIntlProvider>,
    );
    expect(container.textContent).not.toMatch(/\block\.[a-z_]+\.|\bexam\.[a-z_]+\.|\bcheck\.[a-z]/);
    expect(errors).not.toHaveBeenCalled();
  });

  it("E.3 shows the code, the device and Pair", () => {
    const handlers = show(VIEWS.pair as LockView, locale);
    expect(screen.getByText("482 913")).toBeTruthy();
    expect(screen.getByText("Windows · Aliya S.")).toBeTruthy();
    expect(screen.getByText(m.pair.badge)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.pair.action }));
    expect(handlers.confirm).toHaveBeenCalledOnce();
  });

  it("E.3 asks for a code with Pair when none is shown yet", () => {
    const handlers = show({ ...(VIEWS.pair as LockView), pair: null, pair_error: "expired" }, locale);
    fireEvent.click(screen.getByRole("button", { name: m.pair.action }));
    expect(handlers.pair).toHaveBeenCalledOnce();
  });

  it("E.4 lists what closes and locks on Lock and start", () => {
    const handlers = show(VIEWS.ready as LockView, locale);
    expect(screen.getByText("Physics 1 · Quiz 3")).toBeTruthy();
    expect(screen.getByText(m.ready.note.portal_only)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.ready.start }));
    expect(handlers.lock).toHaveBeenCalledOnce();
  });

  it("E.9 shows the summary and closes", () => {
    const handlers = show(VIEWS.released as LockView, locale);
    expect(screen.getByText(m.done.title)).toBeTruthy();
    expect(screen.getByText(m.done.sent.value)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.done.close }));
    expect(handlers.dismiss).toHaveBeenCalledOnce();
  });
});

it("starts in Kazakh before the app sends a locale", () => {
  render(
    <LockIntlProvider>
      <PopupApp
        view={EMPTY_VIEW}
        productName="Üki Lock"
        otherTabs={0}
        nowMs={NOW}
        locale="kk"
        actions={actions()}
      />
    </LockIntlProvider>,
  );
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toContain(
    loadMessages("kk").lock.pair.open_app.title,
  );
});

it("E.4 keeps Lock and start off until the start comes", () => {
  const lobby = {
    ...(VIEWS.ready as LockView),
    exam_state: {
      type: "exam.state" as const,
      phase: "lobby" as const,
      watch: "watching" as const,
      locale: "en" as const,
      exam,
    },
  };
  show(lobby, "en");
  expect(
    (screen.getByRole("button", { name: loadMessages("en").lock.ready.start }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

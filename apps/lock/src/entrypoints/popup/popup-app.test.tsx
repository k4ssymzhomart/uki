import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_BROWSER_RULES, type LockExam } from "@uki/contracts";
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
/** Four noted attempts; E.8 lists the latest three (Asia/Almaty times 14:09:31 to 14:18:40). */
const noted: NonNullable<LockView["locked"]>["noted"] = [
  {
    id: "0192f3a0-0000-7000-8000-0000000000a1",
    type: "tab.blocked",
    at: Date.parse("2026-10-07T09:05:00Z"),
    host: "vk.com",
  },
  {
    id: "0192f3a0-0000-7000-8000-0000000000a2",
    type: "tab.blocked",
    at: Date.parse("2026-10-07T09:09:31Z"),
    host: null,
  },
  {
    id: "0192f3a0-0000-7000-8000-0000000000a3",
    type: "copy.blocked",
    at: Date.parse("2026-10-07T09:16:05Z"),
    kind: "paste",
  },
  {
    id: "0192f3a0-0000-7000-8000-0000000000a4",
    type: "site.closed",
    at: Date.parse("2026-10-07T09:18:40Z"),
    host: "wikipedia.org",
  },
];

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
    locked: { mode: "browser", exam, started_at: NOW, locale: "kk", blocked_count: 4, noted },
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
  return { pair: vi.fn(), confirm: vi.fn(), lock: vi.fn(), dismiss: vi.fn(), ask: vi.fn() };
}

function show(view: LockView, locale: Locale, handlers = actions()) {
  render(
    <LockIntlProvider locale={locale}>
      <PopupApp view={view} otherTabs={3} nowMs={NOW} locale={locale} actions={handlers} />
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

  it("E.3 shows the header, the code, the device and Pair", () => {
    const handlers = show(VIEWS.pair as LockView, locale);
    expect(screen.getByText(m.name)).toBeTruthy();
    expect(screen.getByText("482 913")).toBeTruthy();
    expect(screen.getByText("Windows · Aliya S.")).toBeTruthy();
    expect(screen.getByText(m.pair.badge)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.pair.action }));
    expect(handlers.confirm).toHaveBeenCalledOnce();
  });

  it("E.3 names the OS alone before the student joins", () => {
    show({ ...(VIEWS.pair as LockView), app: { ...app, os: "macos", student_name: null } }, locale);
    expect(screen.getByText(loadMessages(locale).os.macos)).toBeTruthy();
  });

  it("E.3 asks for a code with Pair when none is shown yet", () => {
    const handlers = show({ ...(VIEWS.pair as LockView), pair: null, pair_error: "expired" }, locale);
    fireEvent.click(screen.getByRole("button", { name: m.pair.action }));
    expect(handlers.pair).toHaveBeenCalledOnce();
  });

  it("E.4 lists what closes and locks on Lock and start", () => {
    const handlers = show(VIEWS.ready as LockView, locale);
    expect(screen.getByText("Physics 1 · Quiz 3")).toBeTruthy();
    // Every rule on without browser_rules: the calculator stays open too.
    expect(screen.getByText(m.ready.note.full)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.ready.start }));
    expect(handlers.lock).toHaveBeenCalledOnce();
  });

  it("E.8 shows time left, the open sites, the noted attempts and Ask proctor", () => {
    const handlers = show(VIEWS.locked as LockView, locale);
    const messages = loadMessages(locale);
    expect(screen.getByText(m.badge)).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
    expect(screen.getByText(m.status.ends.replace("{time}", "14:40"))).toBeTruthy();
    expect(screen.getByRole("heading", { name: m.status.open })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `${m.tab.portal}localhost:5180`,
      `${m.tab.calculator}${m.status.built_in}`,
    ]);
    expect(screen.getByRole("heading", { name: m.status.noted.replace("{count}", "4") })).toBeTruthy();
    const rows = [...document.querySelectorAll("[data-kind]")].map((row) => row.textContent);
    expect(rows).toEqual([
      `14:09:31${m.noted.tab}${m.noted.outside}`,
      `14:16:05${m.noted.copy}${m.noted.kind.paste}`,
      `14:18:40${m.noted.site}wikipedia.org`,
    ]);
    expect(screen.getByText(m.app.watching)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: messages.action.ask_proctor }));
    expect(handlers.ask).toHaveBeenCalledOnce();
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
      <PopupApp view={EMPTY_VIEW} otherTabs={0} nowMs={NOW} locale="kk" actions={actions()} />
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

it("E.4 says only the portal stays open when E.1's calculator rule is off", () => {
  const off = { ...exam, browser_rules: { ...DEFAULT_BROWSER_RULES, calculator: false } };
  show(
    {
      ...(VIEWS.ready as LockView),
      exam_state: { type: "exam.state", phase: "ready", watch: "watching", locale: "en", exam: off },
    },
    "en",
  );
  expect(screen.getByText(loadMessages("en").lock.ready.note.portal_only)).toBeTruthy();
});

describe("E.8 variants", () => {
  const m = loadMessages("en");
  const locked = VIEWS.locked?.locked;
  if (!locked) throw new Error("no locked view");

  it("leaves the calculator out when its rule is off", () => {
    const off = { ...exam, browser_rules: { ...DEFAULT_BROWSER_RULES, calculator: false } };
    show({ ...(VIEWS.locked as LockView), locked: { ...locked, exam: off } }, "en");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `${m.lock.tab.portal}localhost:5180`,
    ]);
  });

  it("an exam in the app: no sites and no Ask proctor (the app has its own); nothing noted, no list", () => {
    show(
      {
        ...(VIEWS.locked as LockView),
        locked: { ...locked, mode: "app", blocked_count: 0, noted: [], exam: { ...exam, mode: "app" } },
      },
      "en",
    );
    expect(screen.queryByRole("heading", { name: m.lock.status.open })).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByText(/NOTED/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks for the app when the link is down", () => {
    show({ ...(VIEWS.locked as LockView), link: "absent", app: null }, "en");
    expect(screen.getByText(m.lock.pair.open_app.title)).toBeTruthy();
  });

  it("stops the time left while the app reports the exam paused", () => {
    const paused: LockView = {
      ...(VIEWS.locked as LockView),
      exam_state: { type: "exam.state", phase: "paused", watch: "watching", locale: "en", exam },
    };
    const { rerender } = render(
      <LockIntlProvider locale="en">
        <PopupApp view={paused} otherTabs={0} nowMs={NOW} locale="en" actions={actions()} />
      </LockIntlProvider>,
    );
    expect(screen.getByText("18:00")).toBeTruthy();
    rerender(
      <LockIntlProvider locale="en">
        <PopupApp view={paused} otherTabs={0} nowMs={NOW + 5000} locale="en" actions={actions()} />
      </LockIntlProvider>,
    );
    expect(screen.getByText("18:00")).toBeTruthy();
  });
});

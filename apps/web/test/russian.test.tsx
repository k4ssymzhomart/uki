// WP 1.2's done-when: every Phase 0 dashboard page (A.0, 0.1, 1.5, 2.4 with its dialogs, 2.5) and the
// Phase 1 shell pieces (3.4a, 0.1b, 0.1c, the sidebar per role) render in Russian with no missing key.
// Each test renders with the Russian messages and fails on any next-intl error (onError) and on any raw
// dashboard.* key left in the page.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { CommandRequest } from "@uki/contracts";
import { DEFAULT_EXAM_CHECKS } from "@uki/contracts";
import { loadMessages } from "@uki/i18n";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LobbyExam, LobbySession, parseRows, RosterEntry } from "../src/features/lobby/lobby-model.ts";
import { LobbyView } from "../src/features/lobby/lobby-view.tsx";
import { DataKeptTile } from "../src/features/overview/data-kept-popover.tsx";
import { parseOverviewRows } from "../src/features/overview/overview-model.ts";
import { OverviewView } from "../src/features/overview/overview-view.tsx";
import { AppShell } from "../src/features/shell/app-shell.tsx";
import { StaffLookupFailed } from "../src/features/shell/staff-lookup-failed.tsx";
import { SignInScreen } from "../src/features/sign-in/sign-in-screen.tsx";
import type { FunctionsClient } from "../src/features/wall/functions-client.ts";
import { LiveWall } from "../src/features/wall/live-wall.tsx";
import {
  event,
  fakeClient,
  initialData,
  iso,
  NOW,
  sessionId,
  sessionRow,
  setupDom,
} from "../src/features/wall/test-helpers.tsx";
import { TimelineDrawer } from "../src/features/wall/timeline-drawer.tsx";
import { FunctionsClientContext } from "../src/features/wall/use-command.ts";
import { WallStoreProvider } from "../src/features/wall/wall-store-context.tsx";
import { DANA, intlErrors, intlProps, rawKeys, renderWithIntl } from "./render.tsx";

setupDom();

const location = vi.hoisted(() => ({ pathname: "/overview", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/image", () => import("./next-image-mock.tsx"));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../src/features/shell/preferences.ts", () => ({
  setDashboardLocale: vi.fn(async () => ({ ok: true })),
  setOverviewFaculty: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../src/features/shell/sign-out.ts", () => ({ signOut: vi.fn() }));
// The lobby's realtime hook needs a Supabase client; here the sessions stay as the server rendered them.
vi.mock("../src/features/lobby/use-lobby-sessions.ts", () => ({
  useLobbySessions: (_examId: string, initial: readonly unknown[]) => initial,
}));
const counts = vi.hoisted(() => ({ frames: 38, events: 9870 }));
vi.mock("../src/lib/supabase/browser.ts", () => ({
  createSupabaseBrowserClient: () => ({
    from: (table: "frames" | "events") => ({
      select: () => ({ in: async () => ({ count: counts[table], error: null }) }),
    }),
  }),
}));

const ru = loadMessages("ru") as unknown as Record<string, unknown>;
/** A plain Russian message by its dotted key. */
function text(key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ru);
  if (typeof value !== "string") throw new Error(`no Russian message ${key}`);
  return value;
}

/** No next-intl error so far, no raw key on the page, and the page is in Russian. */
function expectRussian(): void {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
  expect(document.body.textContent).toMatch(/[А-Яа-яЁё]/);
}

const DANA_RU = { ...DANA, initials: "DA" };

describe("the check itself", () => {
  it("catches a Russian message that is missing", () => {
    const messages = structuredClone(loadMessages("ru")) as unknown as {
      dashboard: { signIn: Record<string, unknown> };
    };
    delete messages.dashboard.signIn.title;
    renderWithIntl(
      <NextIntlClientProvider {...intlProps("ru")} messages={messages as never}>
        <SignInScreen action={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(intlErrors.map((error) => error.code)).toContain("MISSING_MESSAGE");
    expect(rawKeys(document.body)).toEqual(["dashboard.signIn.title"]);
    intlErrors.length = 0;
  });
});

describe("A.0 and the lookup error in Russian", () => {
  it("renders the sign-in screen", () => {
    renderWithIntl(<SignInScreen action={vi.fn()} />, null, "ru");
    expect(screen.getByRole("heading", { name: text("dashboard.signIn.title") })).toBeTruthy();
    expect(screen.getByRole("button", { name: text("dashboard.signIn.submit") })).toBeTruthy();
    expectRussian();
  });

  it("renders the lookup error with Try again", () => {
    renderWithIntl(<StaffLookupFailed />, null, "ru");
    expect(screen.getByRole("link", { name: text("dashboard.shell.lookupFailed.retry") })).toBeTruthy();
    expectRussian();
  });
});

describe("0.1 and 0.1b in Russian", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");
  const base = {
    course: "Mathematics 2",
    duration_min: 90,
    checks: DEFAULT_EXAM_CHECKS,
    groups: ["204"],
    proctor_count: 2,
    roster_size: 128,
    joined: 0,
    writing: 0,
    flagged_events: 0,
    sessions_final: 0,
  };
  const rows = parseOverviewRows([
    {
      ...base,
      id: "e0000000-0000-4000-8000-000000000001",
      title: "Mathematics 2 · Midterm",
      status: "scheduled",
      starts_at: "2026-10-09T05:00:00Z",
      lobby_opens_at: "2026-10-09T04:40:00Z",
    },
    {
      ...base,
      id: "e0000000-0000-4000-8000-000000000002",
      title: "Physics 1 · Quiz 3",
      status: "live",
      starts_at: "2026-10-07T09:00:00Z",
      lobby_opens_at: "2026-10-07T08:40:00Z",
      groups: ["101", "102", "103"],
      joined: 86,
    },
    {
      ...base,
      id: "e0000000-0000-4000-8000-000000000003",
      title: "History of Kazakhstan · Test",
      status: "to_review",
      starts_at: "2026-10-07T06:00:00Z",
      lobby_opens_at: "2026-10-07T05:40:00Z",
      flagged_events: 7,
    },
  ]);

  it("renders the overview with its four filters and the next exam", () => {
    renderWithIntl(
      <OverviewView
        rows={rows}
        groupCount={5}
        readiness={{ ready: 128, total: 128 }}
        nowMs={now}
        scopeName="Все факультеты"
      />,
      DANA_RU,
      "ru",
    );
    expect(screen.getByRole("heading", { level: 1, name: text("dashboard.overview.title") })).toBeTruthy();
    for (const filter of ["all", "upcoming", "live", "done"]) {
      fireEvent.click(screen.getByRole("radio", { name: text(`dashboard.overview.filter.${filter}`) }));
    }
    expect(document.body.textContent).toContain("7 отметок на проверку");
    expect(document.body.textContent).toContain("пт, 9 окт");
    expectRussian();
  });

  it("opens 0.1b and counts the stills and events", async () => {
    renderWithIntl(<DataKeptTile examIds={rows.map((row) => row.id)} />, DANA_RU, "ru");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: text("dashboard.overview.stat.video.label") }));
    });
    expect(await screen.findByText(text("dashboard.overview.dataKept.title"))).toBeTruthy();
    // Russian groups thousands with a no-break space: 9 870.
    await waitFor(() => expect(document.body.textContent).toMatch(/9\s870/u));
    expect(document.body.textContent).toContain("38");
    expectRussian();
  });
});

describe("1.5 Lobby in Russian", () => {
  const now = Date.parse("2026-10-09T04:56:00Z");
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the banner, stats and every tab of the check-in table", () => {
    const exam = LobbyExam.parse({
      id: "e0000000-0000-4000-8000-000000000001",
      title: "Mathematics 2 · Midterm",
      status: "scheduled",
      starts_at: "2026-10-09T05:00:00+00:00",
      duration_min: 90,
      lobby_opens_at: "2026-10-09T04:40:00+00:00",
      groups: ["204"],
    });
    const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const roster = parseRows(
      RosterEntry,
      [
        "Dias Kenzhebekov",
        "Arman Bekzhanov",
        "Aruzhan Kassymova",
        "Yerlan Tokhtarov",
        "Madina Tulegenova",
      ].map((name, index) => ({
        student_id: id(index + 1),
        seat: index + 1,
        invite_status: index === 3 ? "bounced" : "sent",
        student: { full_name: name, student_number: String(20231000 + index) },
      })),
    );
    const session = (n: number, state: string, detail: string | null) => ({
      id: `5e550000-0000-4000-8000-00000000000${n}`,
      student_id: id(n),
      state,
      status: detail ? { step: state, detail } : { step: state },
      device: { os: "windows", app_version: "0.1.0" },
    });
    const sessions = parseRows(LobbySession, [
      session(1, "identity", "card:retry:2"),
      session(2, "checking", "app:Telegram"),
      session(3, "checking", "camera:busy"),
      session(5, "ready", null),
    ]);
    renderWithIntl(
      <LobbyView
        exam={exam}
        roster={roster}
        sessions={sessions}
        who={{ role: "proctor", isLead: true }}
        nowMs={now}
        startAction={vi.fn()}
        measureOffset={async () => null}
      />,
      DANA_RU,
      "ru",
    );
    expect(screen.getByRole("button", { name: text("dashboard.lobby.startExam") })).toBeTruthy();
    for (const tab of screen.getAllByRole("radio")) fireEvent.click(tab);
    expect(document.body.textContent).toContain("Начало в 10:00 · через 4 мин");
    expect(document.body.textContent).toContain("из 5 студентов");
    expectRussian();
  });
});

describe("2.4 and 2.5 in Russian", () => {
  function functions(): FunctionsClient {
    return {
      command: vi.fn(async (_request: CommandRequest) => ({ ok: true as const, data: { command_ids: [] } })),
      stills: vi.fn(async () => ({ ok: true as const, data: { urls: [] } })),
    };
  }

  it("renders the wall, Message group (2.4b), Extend time (2.4c), the tile menu (2.4a) and End (2.4e)", async () => {
    const db = fakeClient();
    const events = [
      event(1, "phone.detected", { score: 0.94, held_ms: 6000 }, { at: iso(0) }),
      event(2, "gaze.off_screen", { duration_ms: 2000, direction: "left" }, { at: iso(-30_000) }),
      event(3, "session.paused", { reason: "face_missing" }, { review: "log", at: iso(-42_000) }),
    ];
    const initial = initialData(
      [
        sessionRow(1),
        sessionRow(2),
        sessionRow(3, { state: "paused" }),
        sessionRow(4, { state: "submitted" }),
      ],
      events,
    );
    const api = functions();
    renderWithIntl(
      <FunctionsClientContext value={() => api}>
        <LiveWall
          initial={{ ...initial, serverNowMs: NOW }}
          getClient={() => db.client}
          measureOffset={async () => 0}
        />
      </FunctionsClientContext>,
      DANA_RU,
      "ru",
    );
    expect(await screen.findByText(text("dashboard.wall.title"))).toBeTruthy();

    // Message group is a dropdown menu (opens on pointer down), Extend time a popover (on click).
    const open = (name: string) => {
      const button = screen.getByRole("button", { name });
      fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
      fireEvent.click(button);
    };
    open(text("dashboard.wall.messageGroup"));
    expect(await screen.findByText(/Быстрое сообщение/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    open(text("dashboard.wall.extendTime"));
    expect((await screen.findAllByText(/^\+\d+ мин$/)).length).toBeGreaterThan(0);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    const tile = document.querySelector<HTMLElement>(`[data-session-id="${sessionId(1)}"]`);
    if (!tile) throw new Error("no tile");
    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(text("dashboard.wall.action.end")) }),
    );
    expect(await screen.findByText(text("dashboard.wall.end.reason"))).toBeTruthy();
    expectRussian();
  });

  it("renders the timeline drawer with its flag card and timeline", async () => {
    const phone = event(1, "phone.detected", { score: 0.94, held_ms: 6000 }, { at: iso(0), frame_count: 3 });
    const look = event(1, "gaze.off_screen", { duration_ms: 2300, direction: "left" }, { at: iso(-248_000) });
    const api = functions();
    renderWithIntl(
      <FunctionsClientContext value={() => api}>
        <WallStoreProvider
          initial={initialData([sessionRow(1, { status: { question: 7 } })], [phone, look])}
          nowMs={NOW}
        >
          <TimelineDrawer client={fakeClient({ events: [phone, look] }).client} sessionId={sessionId(1)} />
        </WallStoreProvider>
      </FunctionsClientContext>,
      DANA_RU,
      "ru",
    );
    const dialog = await screen.findByRole("dialog", { name: "Madina Tulegenova" });
    await waitFor(() =>
      expect(dialog.textContent).toContain(text("dashboard.wall.event.phone_detected.title")),
    );
    expect(dialog.textContent).toContain("место 2");
    expectRussian();
  });
});

describe("the shell in Russian: sidebar, 3.4a and 0.1c", () => {
  const faculties = [
    { id: "fa000000-0000-4000-8000-000000000001", name: "Faculty of Mathematics" },
    { id: "fa000000-0000-4000-8000-000000000002", name: "Faculty of Physics" },
  ];

  function renderShell(role: "exam_office" | "proctor") {
    return renderWithIntl(
      <AppShell
        staff={{ ...DANA, role }}
        groupCodes={["204"]}
        nav={{ examsCount: 4, liveCount: 86, liveHref: "/overview" }}
        facultyMenu={
          role === "exam_office"
            ? { faculties, facultyId: faculties[0]?.id ?? null, counts: { [faculties[0]?.id ?? ""]: 4 } }
            : null
        }
      >
        <p>page</p>
      </AppShell>,
      null,
      "ru",
    );
  }

  it("opens the account menu with the language and Log out", async () => {
    renderShell("exam_office");
    fireEvent.pointerDown(screen.getByRole("button", { name: /Dana Akhmetova/ }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await screen.findByRole("menuitem", { name: new RegExp(text("dashboard.shell.account.language")) }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: new RegExp(text("dashboard.shell.signOut")) })).toBeTruthy();
    expect(document.body.textContent).toContain("РУС");
    expect(document.body.textContent).toContain(`${text("dashboard.shell.role.exam_office")} · KRU`);
    expectRussian();
  });

  it("opens the faculty switcher with the counts and All faculties", async () => {
    renderShell("exam_office");
    fireEvent.pointerDown(screen.getByRole("button", { name: /KRU · Kostanay/ }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole("menuitemcheckbox", { name: /Faculty of Mathematics/ })).toBeTruthy();
    expect(
      screen.getByRole("menuitemcheckbox", { name: text("dashboard.shell.workspace.allFaculties") }),
    ).toBeTruthy();
    expectRussian();
  });

  it("shows a proctor's items in Russian", () => {
    renderShell("proctor");
    const nav = screen.getByRole("navigation", { name: text("dashboard.shell.navLabel") });
    expect(nav.textContent).toContain(text("dashboard.shell.nav.overview"));
    expect(nav.textContent).toContain(text("dashboard.shell.nav.live"));
    expectRussian();
  });
});

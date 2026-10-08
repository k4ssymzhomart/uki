// The wizard's pages (0.4, 0.2 with 0.2a, E.1, 0.3 with 0.3a and 0.3b, 0.5) rendered as the app renders
// them: every page in Russian with no next-intl error and no raw key (WP 1.2's rule for new pages), and
// the roster file's behaviour in English: the demo CSV's bad rows, Edit, Skip, and nothing written until
// the rows are clean. The server actions are mocked; the CSV goes through Papa Parse for real.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  DEFAULT_BROWSER_RULES,
  DEFAULT_EXAM_CHECKS,
  DEFAULT_WORKSPACE_SETTINGS,
  type ExamDraft,
  type ProctorAssignment,
} from "@uki/contracts";
import { loadMessages } from "@uki/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { parseOverviewRows } from "../overview/overview-model.ts";
import { OverviewView } from "../overview/overview-view.tsx";
import { BrowserView } from "./browser-view.tsx";
import { ChecksView } from "./checks-view.tsx";
import { DetailsView } from "./details-view.tsx";
import { ScheduledNotice } from "./new-exam-button.tsx";
import { ReviewView } from "./review-view.tsx";
import { RosterView } from "./roster-view.tsx";
import type { RosterEntry } from "./wizard-data.ts";

vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/exams/e1000000-0000-4000-8000-000000000001/edit/details",
  useSearchParams: () => new URLSearchParams(),
}));
const actions = vi.hoisted(() => ({
  saveExamDraft: vi.fn(),
  importRoster: vi.fn(),
  assignProctors: vi.fn(),
  fixInviteEmail: vi.fn(),
  resendInvite: vi.fn(),
  scheduleExam: vi.fn(),
  sendTestInvite: vi.fn(),
  createExamDraft: vi.fn(),
}));
vi.mock("./wizard-actions.ts", () => actions);
vi.mock("../../lib/supabase/server.ts", () => ({ createSupabaseServerClient: vi.fn() }));

const { previewLines } = await import("./wizard-data.ts");

// The first render of each view loads Radix, next-intl and the messages; on a busy CI runner that alone
// took over Vitest's default 5 s once (0.4 with the date picker).
vi.setConfig({ testTimeout: 30_000 });

const EXAM_ID = "e1000000-0000-4000-8000-000000000001";
const G204 = "a2000000-0000-4000-8000-000000000204";
const GROUPS = [
  { id: G204, code: "204", students: 128 },
  { id: "a2000000-0000-4000-8000-000000000101", code: "101", students: 28 },
];
const NOW = Date.parse("2026-10-08T06:00:00Z");
// Vitest runs in apps/web (pnpm --filter web test).
const demo = readFileSync(join(process.cwd(), "../../demo/roster.csv"), "utf8");

const exam: ExamDraft = {
  id: EXAM_ID,
  workspace_id: "a0000000-0000-4000-8000-000000000001",
  faculty_id: null,
  title: "Mathematics 2 · Midterm",
  course: "Mathematics 2",
  kind: "Midterm",
  code: null,
  mode: "browser",
  starts_at: "2026-10-09T05:00:00Z",
  duration_min: 90,
  lobby_opens_at: "2026-10-09T04:40:00Z",
  status: "draft",
  checks: { ...DEFAULT_EXAM_CHECKS },
  lms_url: "https://exam.kru.test/physics-1/quiz-3",
  lms_done_path: null,
  allowed_sites: [],
  created_by: null,
  created_at: "2026-10-08T04:12:00Z",
  room: null,
  rules_locale: null,
  scheduled_at: null,
  browser_rules: { ...DEFAULT_BROWSER_RULES },
  group_ids: [G204],
};

const assignments: ProctorAssignment[] = [
  {
    exam_id: EXAM_ID,
    staff_id: "3fe31f39-082e-4f21-9dc8-ecfd979457ea",
    full_name: "Aigerim Sadykova",
    seat_from: 1,
    seat_to: 12,
    languages: ["ru", "kk"],
    is_lead: true,
    confirmed_at: "2026-10-08T05:00:00Z",
    change_request: null,
  },
  {
    exam_id: EXAM_ID,
    staff_id: "4f70782f-9a20-4f82-b900-de5440c1a674",
    full_name: "Nurlan Bekov",
    seat_from: 13,
    seat_to: 24,
    languages: ["ru", "en"],
    is_lead: false,
    confirmed_at: null,
    change_request: null,
  },
];

const proctors = [
  {
    id: "3fe31f39-082e-4f21-9dc8-ecfd979457ea",
    full_name: "Aigerim Sadykova",
    languages: ["kk" as const, "ru" as const],
  },
  {
    id: "4f70782f-9a20-4f82-b900-de5440c1a674",
    full_name: "Nurlan Bekov",
    languages: ["ru" as const, "en" as const],
  },
];

function entry(
  seat: number,
  name: string,
  number: string,
  status: RosterEntry["invite_status"],
): RosterEntry {
  return {
    student_id: `b0000000-0000-4000-8000-0000${number}`,
    seat,
    invite_status: status,
    student: {
      full_name: name,
      student_number: number,
      email: `${number}@student.kru.test`,
      locale: "kk",
      programme: "Mathematics",
      year: 2,
      group: { code: "204" },
    },
    invite: {
      email: `${number}@student.kru.test`,
      state: status === "opened" ? "sent" : status,
      error: null,
    },
  };
}

const roster = [
  entry(1, "Madina Tulegenova", "20231187", "opened"),
  entry(2, "Arman Bekzhanov", "20230912", "sent"),
  entry(13, "Yerlan Tokhtarov", "20230877", "bounced"),
];

const ru = loadMessages("ru") as unknown as Record<string, unknown>;
function text(key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ru);
  if (typeof value !== "string") throw new Error(`no Russian message ${key}`);
  return value;
}

function expectRussian(): void {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(document.body)).toEqual([]);
  expect(document.body.textContent).toMatch(/[А-Яа-яЁё]/);
}

async function chooseFile(content: string, name = "roster.csv"): Promise<void> {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: "text/csv" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
  actions.saveExamDraft.mockImplementation(async ({ exam: patch }: { exam: Partial<ExamDraft> }) => ({
    ok: true,
    exam: { ...exam, ...patch },
    savedAt: "2026-10-08T06:01:00Z",
  }));
  actions.importRoster.mockResolvedValue({
    ok: true,
    result: { inserted: 0, updated: 24, seats: 24, removed: 0 },
  });
  actions.scheduleExam.mockResolvedValue({ ok: false, problem: "roster_empty", step: "roster" });
  router.push.mockReset();
  router.refresh.mockReset();
});

describe("every wizard page in Russian", () => {
  it("0.4 with the date picker open", async () => {
    renderWithIntl(
      <DetailsView
        exam={exam}
        settings={DEFAULT_WORKSPACE_SETTINGS}
        groups={GROUPS}
        courses={["Mathematics 2", "Physics 1"]}
        examDays={["2026-10-13T04:00:00Z"]}
        nowMs={NOW}
      />,
      DANA,
      "ru",
    );
    expect(screen.getByText("Группа 204 · 128 студентов")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(text("dashboard.wizard.details.when.label")));
    expect(await screen.findByRole("button", { name: text("dashboard.wizard.picker.apply") })).toBeTruthy();
    expectRussian();
  });

  it("0.2 with 0.2a open and the student preview in Kazakh", async () => {
    renderWithIntl(<ChecksView exam={{ ...exam, mode: "app" }} preview={previewLines(2)} />, DANA, "ru");
    fireEvent.click(screen.getByRole("button", { name: text("dashboard.wizard.checks.gazeThreshold.info") }));
    expect(await screen.findByText(text("dashboard.wizard.checks.gazeInfo.body"))).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("radio", { name: "ҚАЗ" }));
    fireEvent.click(screen.getByRole("radio", { name: "ҚАЗ" }));
    expect(screen.getByText("Экраннан 2 секундтан артық көз алсаңыз, Üki белгілеп қояды.")).toBeTruthy();
    expectRussian();
  });

  it("E.1 with the Lock popup the student sees", () => {
    renderWithIntl(<BrowserView exam={exam} />, DANA, "ru");
    expect(screen.getByText("exam.kru.test")).toBeTruthy();
    expect(screen.getByText(text("dashboard.wizard.browser.rule.devtools.detail"))).toBeTruthy();
    expectRussian();
  });

  it("0.3 with the proctors and 0.3b on a bounced address", async () => {
    renderWithIntl(
      <RosterView
        exam={exam}
        roster={roster}
        assignments={assignments}
        proctors={proctors}
        groups={GROUPS}
      />,
      DANA,
      "ru",
    );
    expect(screen.getByText("Места 1–12 · казахский, русский")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: text("dashboard.wizard.roster.action.fixEmail") }));
    expect(await screen.findByText(text("dashboard.wizard.roster.fix.bounced"))).toBeTruthy();
    expectRussian();
  });

  it("0.3a with the demo file's bad rows and Edit open", async () => {
    renderWithIntl(
      <RosterView exam={exam} roster={[]} assignments={[]} proctors={proctors} groups={GROUPS} />,
      DANA,
      "ru",
    );
    await chooseFile(demo);
    expect(
      await screen.findByText("18 из 24 строк верны. Исправьте 6 строк или пропустите их."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: text("dashboard.wizard.roster.action.edit") })[0] as HTMLElement,
    );
    expect(
      await screen.findByLabelText(text("dashboard.wizard.roster.fix.label.student_number")),
    ).toBeTruthy();
    expectRussian();
  });

  it("0.3's Add proctor dialog", async () => {
    renderWithIntl(
      <RosterView
        exam={exam}
        roster={roster}
        assignments={assignments}
        proctors={proctors}
        groups={GROUPS}
      />,
      DANA,
      "ru",
    );
    fireEvent.click(screen.getByRole("button", { name: text("dashboard.wizard.roster.proctors.add") }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expectRussian();
  });

  it("0.5 with a schedule_exam problem linked to its step", async () => {
    renderWithIntl(
      <ReviewView
        exam={exam}
        settings={DEFAULT_WORKSPACE_SETTINGS}
        groupCodes={["204"]}
        rosterSize={24}
        assignments={assignments}
      />,
      DANA,
      "ru",
    );
    fireEvent.click(screen.getByRole("button", { name: text("dashboard.wizard.review.schedule") }));
    expect(await screen.findByText(text("dashboard.wizard.review.problem.roster_empty"))).toBeTruthy();
    expect(screen.getByRole("link", { name: "Перейти: Студенты" }).getAttribute("href")).toBe(
      `/exams/${EXAM_ID}/edit/roster`,
    );
    expectRussian();
  });
});

describe("0.1 and 0.3 after the invites in Russian", () => {
  it("0.1 after Schedule exam with invites that did not go out, and the roster link", async () => {
    const rows = parseOverviewRows([
      {
        id: EXAM_ID,
        faculty_id: null,
        title: "Mathematics 2 · Midterm",
        course: "Mathematics 2",
        status: "scheduled",
        starts_at: "2026-10-09T05:00:00Z",
        duration_min: 90,
        lobby_opens_at: "2026-10-09T04:40:00Z",
        checks: DEFAULT_EXAM_CHECKS,
        groups: ["204"],
        proctor_count: 2,
        roster_size: 24,
        joined: 0,
        writing: 0,
        flagged_events: 0,
        sessions_final: 0,
      },
    ]);
    renderWithIntl(
      <>
        <OverviewView rows={rows} groupCount={4} readiness={{ ready: 21, total: 24 }} nowMs={NOW} />
        <ScheduledNotice notice={{ code: "MATH2-204-FRI2", examId: EXAM_ID, unsent: 3 }} />
      </>,
      DANA,
      "ru",
    );
    expect(
      await screen.findByText("Экзамен запланирован. Студенты входят по коду MATH2-204-FRI2."),
    ).toBeTruthy();
    expect(
      await screen.findByText("3 приглашения не ушли. Причина указана в списке студентов."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Исправить 3 адреса" }).getAttribute("href")).toBe(
      `/exams/${EXAM_ID}/edit/roster`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Открыть список" }));
    expect(router.push).toHaveBeenCalledWith(`/exams/${EXAM_ID}/edit/roster`);
    expectRussian();
  });

  it("0.3's Resend on a scheduled exam", async () => {
    actions.resendInvite.mockResolvedValue({ ok: true });
    renderWithIntl(
      <RosterView
        exam={{ ...exam, status: "scheduled", code: "MATH2-204-FRI" }}
        roster={roster}
        assignments={assignments}
        proctors={proctors}
        groups={GROUPS}
      />,
      DANA,
      "ru",
    );
    const row = screen.getByText("Arman Bekzhanov").closest("tr") as HTMLElement;
    await act(async () => {
      fireEvent.click(
        within(row).getByRole("button", { name: text("dashboard.wizard.roster.action.resend") }),
      );
    });
    expect(await screen.findByText("Приглашение снова отправлено: Arman Bekzhanov.")).toBeTruthy();
    expectRussian();
  });
});

describe("0.3a: the roster file", () => {
  function renderRoster() {
    return renderWithIntl(
      <RosterView exam={exam} roster={[]} assignments={[]} proctors={proctors} groups={GROUPS} />,
      DANA,
    );
  }

  it("lists the demo file's six bad rows with what to fix, and writes nothing", async () => {
    renderRoster();
    await chooseFile(demo);
    const card = await screen.findByRole("region", { name: "roster.csv" });
    expect(within(card).getByText("18 of 24 rows are valid. Fix 6 rows or skip them.")).toBeTruthy();
    for (const [row, problem] of [
      [4, "Student ID 2023504 is not 8 digits"],
      [9, "Group is empty"],
      [10, "Group 240 is not in this university"],
      [14, "Email has no @"],
      [17, "Student ID 20231044 appears twice"],
      [21, "Name is empty"],
    ] as const) {
      const item = within(card).getByText(`Row ${row}`).closest("li") as HTMLElement;
      expect(within(item).getByText(problem)).toBeTruthy();
    }
    expect(screen.getByText("Students · 18 valid")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next: review" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Needs a fix · 6" }));
    const students = screen.getByRole("region", { name: "Students · 18 valid" });
    expect(within(students).getAllByRole("row")).toHaveLength(7);
    expect(within(students).getByText("Kamila Tursynova")).toBeTruthy();
    expect(actions.importRoster).not.toHaveBeenCalled();
  });

  it("imports only after the last row is fixed through Edit", async () => {
    renderRoster();
    await chooseFile(demo);
    const card = await screen.findByRole("region", { name: "roster.csv" });
    const fix = async (row: number, label: string, value: string) => {
      const item = within(card).getByText(`Row ${row}`).closest("li") as HTMLElement;
      fireEvent.click(within(item).getByRole("button", { name: "Edit" }));
      const panel = await screen.findByRole("dialog");
      fireEvent.change(within(panel).getByLabelText(label), { target: { value } });
      await act(async () => {
        fireEvent.click(within(panel).getByRole("button", { name: "Save" }));
      });
    };
    await fix(4, "New student ID", "20235004");
    await fix(14, "New email", "20231219@student.kru.test");
    await fix(17, "New student ID", "20235017");
    await fix(21, "Full name", "Alikhan Utepov");
    expect(actions.importRoster).not.toHaveBeenCalled();
    expect(within(card).getByText("22 of 24 rows are valid. Fix 2 rows or skip them.")).toBeTruthy();
  });

  it("skips the bad rows and imports the 18 good ones in file order", async () => {
    renderRoster();
    await chooseFile(demo);
    await screen.findByRole("region", { name: "roster.csv" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip 6 rows" }));
    });
    await waitFor(() => expect(actions.importRoster).toHaveBeenCalledTimes(1));
    const call = actions.importRoster.mock.calls[0] as [{ rows: { student_number: string }[] }];
    const { rows } = call[0];
    expect(rows).toHaveLength(18);
    expect(rows[0]?.student_number).toBe("20235001");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("imports a clean file at once", async () => {
    renderRoster();
    await chooseFile(
      "student number,full name,email,group,language\n20231187,Madina Tulegenova,m@kru.test,204,kk\n",
    );
    await waitFor(() => expect(actions.importRoster).toHaveBeenCalledTimes(1));
    expect(actions.importRoster.mock.calls[0]?.[0]).toEqual({
      exam_id: EXAM_ID,
      rows: [
        {
          student_number: "20231187",
          full_name: "Madina Tulegenova",
          email: "m@kru.test",
          group: "204",
          locale: "kk",
        },
      ],
    });
  });

  it("says why a file cannot be used", async () => {
    renderRoster();
    await chooseFile("", "empty.csv");
    expect(await screen.findByText("This file has no rows.")).toBeTruthy();
  });
});

describe("0.5 and E.1 behaviour", () => {
  it("sends a test invite to the signed-in staff member, and waits for a roster before it can", async () => {
    actions.sendTestInvite.mockResolvedValue({ ok: true });
    const view = renderWithIntl(
      <ReviewView
        exam={exam}
        settings={DEFAULT_WORKSPACE_SETTINGS}
        groupCodes={["204"]}
        rosterSize={24}
        assignments={assignments}
      />,
      DANA,
    );
    expect(screen.getByText("Nurlan Bekov hasn’t confirmed yet. You can schedule now.")).toBeTruthy();
    expect(screen.queryByText(/reminder/)).toBeNull();
    expect(screen.getByText("Seats 1–12 · Kazakh, Russian · confirmed")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send a test invite to me" }));
    });
    expect(actions.sendTestInvite).toHaveBeenCalledWith({ exam_id: EXAM_ID });
    expect(await screen.findByText("Test invite sent. Check your inbox.")).toBeTruthy();
    view.unmount();

    renderWithIntl(
      <ReviewView
        exam={exam}
        settings={DEFAULT_WORKSPACE_SETTINGS}
        groupCodes={["204"]}
        rosterSize={0}
        assignments={[]}
      />,
      DANA,
    );
    const button = screen.getByRole("button", { name: "Send a test invite to me" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("The test invite is written for the first student, so it waits for the roster."),
    ).toBeTruthy();
  });

  it("shows a proctor's change request from 0.9a on 0.5, in English and Russian", () => {
    const asked = assignments.map((row) =>
      row.full_name === "Nurlan Bekov" ? { ...row, change_request: "Only seats 13 to 20, please." } : row,
    );
    const props = {
      exam,
      settings: DEFAULT_WORKSPACE_SETTINGS,
      groupCodes: ["204"],
      rosterSize: 24,
      assignments: asked,
    };
    const view = renderWithIntl(<ReviewView {...props} />, DANA);
    expect(
      screen.getByText("Seats 13–24 · Russian, English · change requested: “Only seats 13 to 20, please.”"),
    ).toBeTruthy();
    view.unmount();
    renderWithIntl(<ReviewView {...props} />, DANA, "ru");
    expect(
      screen.getByText("Места 13–24 · русский, английский · просит изменить: «Only seats 13 to 20, please.»"),
    ).toBeTruthy();
    expectRussian();
  });

  it("says when the test invite did not go out", async () => {
    actions.sendTestInvite.mockResolvedValue({ ok: false, error: "failed" });
    renderWithIntl(
      <ReviewView
        exam={exam}
        settings={DEFAULT_WORKSPACE_SETTINGS}
        groupCodes={["204"]}
        rosterSize={24}
        assignments={assignments}
      />,
      DANA,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send a test invite to me" }));
    });
    expect(await screen.findByText("The test invite could not be sent.")).toBeTruthy();
  });

  it("resends a sent invite from 0.3, and fixes a bounced address through 0.3b on a scheduled exam", async () => {
    actions.resendInvite.mockResolvedValue({ ok: true });
    actions.fixInviteEmail.mockResolvedValue({ ok: true });
    const scheduled = { ...exam, status: "scheduled" as const, code: "MATH2-204-FRI" };
    renderWithIntl(
      <RosterView
        exam={scheduled}
        roster={roster}
        assignments={assignments}
        proctors={proctors}
        groups={GROUPS}
      />,
      DANA,
    );
    await act(async () => {
      const row = screen.getByText("Arman Bekzhanov").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: "Resend" }));
    });
    expect(actions.resendInvite).toHaveBeenCalledWith({
      exam_id: EXAM_ID,
      student_id: "b0000000-0000-4000-8000-000020230912",
    });
    expect(await screen.findByText("The invite went out again to Arman Bekzhanov.")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Fix email" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("The invite goes out again to the new address.")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("New email"), {
      target: { value: "Yerlan.Tokhtarov@Student.KRU.test" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save" }));
    });
    expect(actions.fixInviteEmail).toHaveBeenCalledWith({
      exam_id: EXAM_ID,
      student_id: "b0000000-0000-4000-8000-000020230877",
      email: "yerlan.tokhtarov@student.kru.test",
      roster: true,
    });
  });

  it("says when a resend did not go out", async () => {
    actions.resendInvite.mockResolvedValue({ ok: false, error: "failed" });
    renderWithIntl(
      <RosterView
        exam={{ ...exam, status: "scheduled" }}
        roster={roster}
        assignments={assignments}
        proctors={proctors}
        groups={GROUPS}
      />,
      DANA,
    );
    await act(async () => {
      const row = screen.getByText("Arman Bekzhanov").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: "Resend" }));
    });
    expect(
      await screen.findByText("The invite to Arman Bekzhanov could not be sent. Try again in a minute."),
    ).toBeTruthy();
  });

  it("saves an E.1 switch into browser_rules", async () => {
    renderWithIntl(<BrowserView exam={exam} />, DANA);
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Block printing" }));
    });
    await waitFor(() =>
      expect(actions.saveExamDraft).toHaveBeenCalledWith({
        exam: { id: EXAM_ID, browser_rules: { print: false } },
      }),
    );
    expect(screen.getByRole("switch", { name: "Block developer tools" }).hasAttribute("disabled")).toBe(true);
  });
});

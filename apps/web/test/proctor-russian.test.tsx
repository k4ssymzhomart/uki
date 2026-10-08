// WP 1.5: 0.9 My exams with 0.9a (both steps), and the lobby's 1.5a student card and 1.5b Identity help,
// render in Russian with no missing key, like every other dashboard page (WP 1.2's russian.test.tsx).
// Each test fails on any next-intl error and on any raw dashboard.* key.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CompactEvent } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChangeRequestRow,
  LobbyExam,
  LobbySession,
  parseRows,
  RosterEntry,
} from "../src/features/lobby/lobby-model.ts";
import { LobbyView } from "../src/features/lobby/lobby-view.tsx";
import { HOVER_OPEN_MS } from "../src/features/lobby/use-hover-card.ts";
import { MyAssignmentRow, type MyExam } from "../src/features/my-exams/my-exams-model.ts";
import { MyExamsView } from "../src/features/my-exams/my-exams-view.tsx";
import { parseOverviewRows } from "../src/features/overview/overview-model.ts";
import { OverviewView } from "../src/features/overview/overview-view.tsx";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/image", () => import("./next-image-mock.tsx"));
vi.mock("../src/features/lobby/use-lobby-sessions.ts", () => ({
  useLobbySessions: (_examId: string, initial: readonly unknown[]) => initial,
}));
vi.mock("../src/features/lobby/identity-help-data.ts", () => ({
  fetchIdentityHelp: async (): Promise<CompactEvent[]> => [
    {
      id: "0199c000-0000-7000-8000-000000000001",
      session_id: "5e550000-0000-4000-8000-000000000001",
      exam_id: "e0000000-0000-4000-8000-000000000001",
      type: "student.help_requested",
      source: "app",
      review: "log",
      at: "2026-10-09T04:52:05Z",
      received_at: "2026-10-09T04:52:05Z",
      data: { topic: "identity" },
      frame_count: 0,
    },
  ],
}));
// The overview's 0.1b tile reads counts in the browser; this test only needs the exam rows.
vi.mock("../src/features/overview/data-kept-popover.tsx", () => ({ DataKeptTile: () => null }));

const NOW = Date.parse("2026-10-08T07:00:00Z");
const NURLAN = { ...DANA, initials: "NB", fullName: "Nurlan Bekov", role: "proctor" as const };
const CHECKS = { gaze_s: 2, phone_score: 0.85, face_missing_s: 10, identity: true, lock: true };

function myExam(n: number, title: string, startsAt: string, confirmed: boolean, seats: boolean): MyExam {
  return {
    ...MyAssignmentRow.parse({
      exam_id: `e0000000-0000-4000-8000-00000000000${n}`,
      seat_from: seats ? 65 : null,
      seat_to: seats ? 128 : null,
      languages: ["ru", "en"],
      is_lead: false,
      confirmed_at: confirmed ? "2026-10-07T10:00:00Z" : null,
      change_request: null,
      exam: {
        id: `e0000000-0000-4000-8000-00000000000${n}`,
        title,
        course: title.split(" · ")[0],
        status: "scheduled",
        starts_at: startsAt,
        duration_min: 90,
        lobby_opens_at: new Date(Date.parse(startsAt) - 20 * 60_000).toISOString(),
        checks: CHECKS,
        creator: n === 1 ? { full_name: "Dana Akhmetova" } : null,
      },
    }),
    students: 64,
  };
}

function expectClean(container: HTMLElement = document.body) {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
  expect(rawKeys(container)).toEqual([]);
}

describe("0.9 and 0.9a in Russian", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the banner, the stat cards, the rows and both steps of 0.9a", () => {
    renderWithIntl(
      <MyExamsView
        exams={[
          myExam(1, "Mathematics 2 · Midterm", "2026-10-09T05:00:00Z", false, true),
          myExam(2, "Physics 1 · Quiz 3", "2026-10-08T09:00:00Z", true, false),
          myExam(3, "Linear Algebra · Final", "2026-10-21T04:00:00Z", false, true),
        ]}
        nowMs={NOW}
        confirmAction={vi.fn()}
      />,
      NURLAN,
      "ru",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Мои экзамены" })).toBeTruthy();
    expect(screen.getByText("Подтвердите места на экзамене «Mathematics 2»")).toBeTruthy();
    expect(screen.getByText("Сегодня 14:00")).toBeTruthy();
    expect(screen.getByText("2 экзамена")).toBeTruthy();
    expect(screen.getAllByText("Места 65–128 · русский, английский")).toHaveLength(2);
    expect(screen.getByText("Все места · русский, английский")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Подтвердить места" })).toHaveLength(2);
    expect(screen.getByText("Подтверждено")).toBeTruthy();
    expectClean();

    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    const dialog = screen.getByRole("dialog", { name: "Подтвердить «Mathematics 2»?" });
    expect(within(dialog).getByText(/Вы говорите с ними на русском и английском\./)).toBeTruthy();
    expect(within(dialog).getByText(/Места 65–128, 64 студента\./)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Попросить изменить" }));
    const change = screen.getByRole("dialog", { name: "Попросить изменить" });
    expect(within(change).getByRole("textbox", { name: "Что нужно изменить?" })).toBeTruthy();
    expect(within(change).getByRole("button", { name: "Назад" })).toBeTruthy();
    expect(within(change).getByRole("button", { name: "Отправить запрос" })).toBeTruthy();
    expectClean();
  });
});

describe("1.5a and 1.5b in Russian", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse("2026-10-09T04:56:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const exam = LobbyExam.parse({
    id: "e0000000-0000-4000-8000-000000000001",
    title: "Mathematics 2 · Midterm",
    status: "scheduled",
    starts_at: "2026-10-09T05:00:00+00:00",
    duration_min: 90,
    lobby_opens_at: "2026-10-09T04:40:00+00:00",
    groups: ["204"],
  });
  const roster = parseRows(RosterEntry, [
    {
      student_id: "b0000000-0000-4000-8000-000000000001",
      seat: 23,
      invite_status: "sent",
      student: { full_name: "Madina Tulegenova", student_number: "20231187", group: { code: "204" } },
    },
  ]);
  const sessions = parseRows(LobbySession, [
    {
      id: "5e550000-0000-4000-8000-000000000001",
      student_id: "b0000000-0000-4000-8000-000000000001",
      state: "identity",
      status: { step: "identity", detail: "card:help:3" },
      device: { os: "macos", app_version: "1.4.2" },
      locale: "en",
    },
  ]);

  it("renders the lobby row, the student card on hover, Identity help and the change request", async () => {
    renderWithIntl(
      <LobbyView
        exam={exam}
        roster={roster}
        sessions={sessions}
        who={{ role: "exam_office", isLead: false }}
        nowMs={Date.parse("2026-10-09T04:56:00Z")}
        startAction={vi.fn()}
        changeRequests={[
          ChangeRequestRow.parse({
            staff_id: "57af0000-0000-4000-8000-000000000002",
            seat_from: 65,
            seat_to: 128,
            change_request: "Места 1–64, пожалуйста.",
            staff: { full_name: "Nurlan Bekov" },
          }),
        ]}
        measureOffset={async () => null}
      />,
      DANA,
      "ru",
    );
    expect(screen.getByText("Билет не читается · 3 из 3 попыток")).toBeTruthy();
    expect(screen.getByText("Nurlan Bekov просит изменить места 65–128")).toBeTruthy();
    expect(screen.getByText("«Места 1–64, пожалуйста.»")).toBeTruthy();
    expectClean();

    fireEvent.mouseEnter(document.querySelector("tr[data-student-id]") as HTMLElement);
    await act(async () => {
      vi.advanceTimersByTime(HOVER_OPEN_MS + 10);
    });
    const card = document.querySelector<HTMLElement>("[data-student-card]");
    if (!card) throw new Error("no card");
    expect(within(card).getByText("Регистрация · шаг 2 из 4")).toBeTruthy();
    expect(within(card).getByText("3 из 3 попыток")).toBeTruthy();
    expect(within(card).getByText("20231187 · Группа 204")).toBeTruthy();
    expect(within(card).getByText("помощь")).toBeTruthy();
    expect(within(card).getByText("Проблема")).toBeTruthy();
    expect(within(card).getByText("Билет не читается")).toBeTruthy();
    expect(within(card).getByText("Устройство")).toBeTruthy();
    expectClean();

    fireEvent.click(within(card).getByRole("button", { name: "Помочь" }));
    const drawer = await screen.findByRole("dialog", { name: "Помощь с личностью" });
    await waitFor(() => expect(within(drawer).getByText("Просит помощи")).toBeTruthy());
    expect(within(drawer).getByRole("textbox", { name: "Подсказка для Madina" })).toBeTruthy();
    expect(within(drawer).getByText("Язык приложения Madina: английский · 0/200")).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Отправить подсказку" })).toBeTruthy();
    expect(within(drawer).getByText("Вы видите результат каждой попытки, но не фото.")).toBeTruthy();
    expectClean();
  });
});

describe("0.1's change request in Russian", () => {
  it("marks the exam row of an exam with a change request", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const [row] = parseOverviewRows([
      {
        id: "e0000000-0000-4000-8000-000000000001",
        faculty_id: null,
        title: "Mathematics 2 · Midterm",
        course: "Mathematics 2",
        status: "scheduled",
        starts_at: "2026-10-09T05:00:00Z",
        duration_min: 90,
        lobby_opens_at: "2026-10-09T04:40:00Z",
        checks: CHECKS,
        groups: ["204"],
        proctor_count: 2,
        roster_size: 128,
        joined: 0,
        writing: 0,
        flagged_events: 0,
        sessions_final: 0,
      },
    ]);
    if (!row) throw new Error("row did not parse");
    renderWithIntl(
      <OverviewView rows={[row]} groupCount={6} readiness={null} nowMs={NOW} changeRequests={[row.id]} />,
      DANA,
      "ru",
    );
    expect(screen.getByText("Запрошено изменение")).toBeTruthy();
    expectClean();
    vi.useRealTimers();
  });
});

import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DANA, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { LobbyExam, LobbySession, parseRows, RosterEntry } from "./lobby-model.ts";
import { LobbyView } from "./lobby-view.tsx";

vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));
// The realtime hook needs a Supabase client; here the sessions stay as the server rendered them.
vi.mock("./use-lobby-sessions.ts", () => ({
  useLobbySessions: (_examId: string, initial: readonly unknown[]) => initial,
}));

const now = Date.parse("2026-10-09T04:56:00Z");
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
    ["Dias Kenzhebekov", "20231044", 12],
    ["Arman Bekzhanov", "20230912", 5],
    ["Aruzhan Kassymova", "20231219", 14],
    ["Yerlan Tokhtarov", "20230877", 41],
    ["Madina Tulegenova", "20231187", 23],
  ].map(([name, number, seat], index) => ({
    student_id: id(index + 1),
    seat,
    invite_status: name === "Yerlan Tokhtarov" ? "bounced" : "sent",
    student: { full_name: name, student_number: number },
  })),
);
const session = (n: number, state: string, detail: string | null, os = "windows") => ({
  id: `5e550000-0000-4000-8000-00000000000${n}`,
  student_id: id(n),
  state,
  status: detail ? { step: state, detail } : { step: state },
  device: { os, app_version: "0.1.0" },
});
const sessions = parseRows(LobbySession, [
  session(1, "identity", "card_retry:2"),
  session(2, "checking", "Telegram", "macos"),
  session(3, "checking", "camera_blocked"),
  session(5, "ready", null, "macos"),
]);

function renderLobby(
  who: { role: "exam_office" | "proctor" | "admin"; isLead: boolean },
  startAction = vi.fn(),
) {
  return renderWithIntl(
    <LobbyView
      exam={exam}
      roster={roster}
      sessions={sessions}
      who={who}
      nowMs={now}
      startAction={startAction}
    />,
    DANA,
  );
}

describe("1.5 Lobby", () => {
  // The banner's clock ticks from Date.now() after hydration; pin it to the server's render time.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the banner and the stat cards from the roster and sessions", () => {
    const { container } = renderLobby({ role: "proctor", isLead: true });
    expect(screen.getByText("Starts at 10:00 · in 4 min")).toBeTruthy();
    expect(screen.getByText("4 of 5 students are in.")).toBeTruthy();
    expect(screen.getByText("Three need help. One has not opened Üki yet.")).toBeTruthy();
    expect(screen.getByText("Live / Mathematics 2 · Midterm · Group 204")).toBeTruthy();
    expect(screen.getByText("of 5 students")).toBeTruthy();
    expect(rawKeys(container)).toEqual([]);
  });

  it("opens on Need help, with each student's step, detail and device", () => {
    renderLobby({ role: "proctor", isLead: true });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Arman Bekzhanov",
      "Dias Kenzhebekov",
      "Aruzhan Kassymova",
    ]);
    expect(screen.getByText("Telegram is open")).toBeTruthy();
    expect(screen.getByText("Card unreadable · retry 2 of 3")).toBeTruthy();
    expect(screen.getByText("Camera blocked by another app")).toBeTruthy();
    expect(screen.getByText("macOS · Üki 0.1.0")).toBeTruthy();
  });

  it("filters by tab and searches on the client; Call stays hidden", () => {
    renderLobby({ role: "proctor", isLead: true });
    fireEvent.click(screen.getByRole("radio", { name: "Not joined · 1" }));
    expect(screen.getByText("Invite email bounced")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("Call")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("Find a student"), { target: { value: "20231187" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Waiting for the start")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find a student"), { target: { value: "nobody" } });
    expect(screen.getByText("No students in this list.")).toBeTruthy();
  });

  it("enables Start exam for the lead proctor and the exam office only", () => {
    renderLobby({ role: "proctor", isLead: false });
    expect(screen.getByRole("button", { name: "Start exam" }).hasAttribute("disabled")).toBe(true);
  });

  it("starts the exam, and shows why when start_exam refuses", async () => {
    const startAction = vi.fn(async () => ({ error: "alreadyStarted" as const }));
    renderLobby({ role: "exam_office", isLead: false }, startAction);
    const button = screen.getByRole("button", { name: "Start exam" });
    expect(button.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(startAction).toHaveBeenCalledWith({ exam_id: exam.id });
    expect(await screen.findByText("The exam has already started.")).toBeTruthy();
  });
});

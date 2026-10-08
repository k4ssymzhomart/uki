// 0.9 My exams and 0.9a Confirm seats: the banner, the stat cards and the rows from the proctor's
// assignments; Confirm seats and Ask for a change through the confirm_seats action.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DANA, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import type { ConfirmSeatsAction } from "./confirm-seats-dialog.tsx";
import { MyAssignmentRow, type MyExam } from "./my-exams-model.ts";
import { MyExamsView } from "./my-exams-view.tsx";

// Thursday 8 October 2026, 12:00 in Almaty.
const NOW = Date.parse("2026-10-08T07:00:00Z");
const NURLAN = { ...DANA, initials: "NB", fullName: "Nurlan Bekov", role: "proctor" as const };
const CHECKS = { gaze_s: 2, phone_score: 0.85, face_missing_s: 10, identity: true, lock: true };

function exam(
  n: number,
  title: string,
  startsAt: string,
  seats: [number, number] | null,
  languages: string[],
  students: number,
  confirmed: boolean,
): MyExam {
  return {
    ...MyAssignmentRow.parse({
      exam_id: `e0000000-0000-4000-8000-00000000000${n}`,
      seat_from: seats?.[0] ?? null,
      seat_to: seats?.[1] ?? null,
      languages,
      is_lead: false,
      confirmed_at: confirmed ? "2026-10-07T10:00:00Z" : null,
      change_request: null,
      exam: {
        id: `e0000000-0000-4000-8000-00000000000${n}`,
        title,
        course: title.split(" · ")[0],
        status: "scheduled",
        starts_at: startsAt,
        duration_min: n === 2 ? 40 : n === 4 ? 180 : 90,
        lobby_opens_at: new Date(Date.parse(startsAt) - 20 * 60_000).toISOString(),
        checks: CHECKS,
        creator: { full_name: "Dana Akhmetova" },
      },
    }),
    students,
  };
}

// The rows of 0.9 (164:13518).
const EXAMS: MyExam[] = [
  exam(2, "Physics 1 · Quiz 3", "2026-10-08T09:00:00Z", [30, 58], ["kk", "ru"], 29, true),
  exam(1, "Mathematics 2 · Midterm", "2026-10-09T05:00:00Z", [65, 128], ["ru", "en"], 64, false),
  exam(4, "Linear Algebra · Final", "2026-10-13T04:00:00Z", [107, 159], ["ru"], 53, true),
];
const MATH = EXAMS[1] as MyExam;

function setup(action: ConfirmSeatsAction = vi.fn()) {
  return renderWithIntl(<MyExamsView exams={EXAMS} nowMs={NOW} confirmAction={action} />, NURLAN);
}

/** A row by its exam link; `hidden` also finds it behind an open modal. */
const row = (title: string) =>
  screen.getByRole("link", { name: title, hidden: true }).closest("tr") as HTMLElement;

describe("0.9 My exams", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws the banner, the four stat cards and the assignments as 0.9 does", () => {
    const { container } = setup();
    expect(screen.getByRole("heading", { level: 1, name: "My exams" })).toBeTruthy();
    expect(screen.getByText("Confirm your seats for Mathematics 2")).toBeTruthy();
    expect(
      screen.getByText(
        "Dana Akhmetova assigned you seats 65–128 on Fri 9 Oct. Confirm them or ask for a change.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Today 14:00")).toBeTruthy();
    expect(screen.getByText("3 exams")).toBeTruthy();
    expect(screen.getByText("this week and next")).toBeTruthy();
    expect(screen.getByText("146")).toBeTruthy();
    expect(screen.getByText("across your seats")).toBeTruthy();
    expect(screen.getByText("Mathematics 2 · Fri")).toBeTruthy();

    const physics = within(row("Physics 1 · Quiz 3"));
    expect(physics.getByText("Seats 30–58 · Kazakh, Russian")).toBeTruthy();
    expect(physics.getByText("Today · 14:00")).toBeTruthy();
    expect(physics.getByText("40 min")).toBeTruthy();
    expect(physics.getByText("29")).toBeTruthy();
    expect(physics.getByText("Confirmed")).toBeTruthy();
    expect(physics.queryByRole("button")).toBeNull();
    const math = within(row("Mathematics 2 · Midterm"));
    expect(math.getByText("Seats 65–128 · Russian, English")).toBeTruthy();
    expect(math.getByText("Fri 9 Oct · 10:00")).toBeTruthy();
    expect(math.getByRole("button", { name: "Confirm seats" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mathematics 2 · Midterm" }).getAttribute("href")).toBe(
      `/exams/${MATH.exam_id}/lobby`,
    );
    expect(rawKeys(container)).toEqual([]);
  });

  it("confirms the seats from the row's chip (0.9a) and turns the row Confirmed", async () => {
    const action = vi.fn<ConfirmSeatsAction>(async (input) => ({
      ok: true as const,
      assignment: { exam_id: input.exam_id, confirmed_at: "2026-10-08T07:01:00Z", change_request: null },
    }));
    setup(action);
    fireEvent.click(within(row("Mathematics 2 · Midterm")).getByRole("button", { name: "Confirm seats" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm Mathematics 2?" });
    expect(
      within(dialog).getByText(
        "Fri 9 Oct, 10:00–11:30. Seats 65–128, 64 students. You speak with them in Russian and English. The lobby opens at 09:40.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm seats" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ exam_id: MATH.exam_id }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Seats confirmed for Mathematics 2.")).toBeTruthy();
    expect(within(row("Mathematics 2 · Midterm")).getByText("Confirmed")).toBeTruthy();
    expect(screen.queryByText("Confirm your seats for Mathematics 2")).toBeNull();
    expect(screen.getByText("All confirmed")).toBeTruthy();
  });

  it("asks for a change from the banner's Review, with Back and the note, and the row says Change requested", async () => {
    const action = vi.fn<ConfirmSeatsAction>(async (input) => ({
      ok: true as const,
      assignment: {
        exam_id: input.exam_id,
        confirmed_at: null,
        change_request: input.change_request ?? null,
      },
    }));
    setup(action);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm Mathematics 2?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask for a change" }));
    const change = screen.getByRole("dialog", { name: "Ask for a change" });
    expect(
      within(change).getByText(
        "The exam office sees your note on Mathematics 2 and changes your seats or languages.",
      ),
    ).toBeTruthy();
    const send = within(change).getByRole("button", { name: "Send request" });
    expect(send.hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(change).getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "Confirm Mathematics 2?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask for a change" }));
    const field = screen.getByRole("textbox", { name: "What should change?" });
    expect(field.getAttribute("maxlength")).toBe("500");
    fireEvent.change(field, { target: { value: " Seats 1–64, please. " } });
    expect(screen.getByText("21/500")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ exam_id: MATH.exam_id, change_request: "Seats 1–64, please." }),
    );
    expect(await screen.findByText("Change request sent to the exam office.")).toBeTruthy();
    const math = within(row("Mathematics 2 · Midterm"));
    expect(math.getByRole("button", { name: "Change requested" })).toBeTruthy();
    expect(screen.queryByText("Confirm your seats for Mathematics 2")).toBeNull();
  });

  it("keeps the dialog open and says so when confirm_seats fails", async () => {
    const action = vi.fn<ConfirmSeatsAction>(async () => ({ ok: false as const, error: "failed" as const }));
    setup(action);
    fireEvent.click(within(row("Mathematics 2 · Midterm")).getByRole("button", { name: "Confirm seats" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm seats" }));
    expect(await screen.findByText("Could not save. Try again.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Confirm Mathematics 2?" })).toBeTruthy();
    expect(
      within(row("Mathematics 2 · Midterm")).getByRole("button", { name: "Confirm seats", hidden: true }),
    ).toBeTruthy();
  });

  it("says so when nothing is assigned", () => {
    renderWithIntl(<MyExamsView exams={[]} nowMs={NOW} confirmAction={vi.fn()} />, NURLAN);
    expect(screen.getByText("No exams are assigned to you yet.")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

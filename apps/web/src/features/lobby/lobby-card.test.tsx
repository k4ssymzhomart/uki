// WP 1.5 on the lobby: 1.5a the student card on a row (on hover and on click), 1.5b Identity help with
// Send hint as a message command, and the proctors' change requests for the exam office.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CommandRequest, CompactEvent } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DANA, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import type { FunctionsClient } from "../wall/functions-client.ts";
import { FunctionsClientContext } from "../wall/use-command.ts";
import { ChangeRequestRow, LobbyExam, LobbySession, parseRows, RosterEntry } from "./lobby-model.ts";
import { LobbyView } from "./lobby-view.tsx";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS } from "./use-hover-card.ts";

vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));
vi.mock("./use-lobby-sessions.ts", () => ({
  useLobbySessions: (_examId: string, initial: readonly unknown[]) => initial,
}));
const helpEvents = vi.hoisted(() => ({ list: [] as CompactEvent[], reads: [] as string[] }));
vi.mock("./identity-help-data.ts", () => ({
  fetchIdentityHelp: async (_getClient: unknown, sessionId: string) => {
    helpEvents.reads.push(sessionId);
    return helpEvents.list;
  },
}));

const EXAM = "e0000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-10-09T04:56:00Z");
const exam = LobbyExam.parse({
  id: EXAM,
  title: "Mathematics 2 · Midterm",
  status: "scheduled",
  starts_at: "2026-10-09T05:00:00+00:00",
  duration_min: 90,
  lobby_opens_at: "2026-10-09T04:40:00+00:00",
  groups: ["204"],
});
const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n: number) => `5e550000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const roster = parseRows(
  RosterEntry,
  (
    [
      ["Madina Tulegenova", "20231187", 23],
      ["Dias Kenzhebekov", "20231044", 12],
      ["Zhansaya Omarova", "20231302", 33],
      ["Yerlan Tokhtarov", "20230877", 41],
    ] as const
  ).map(([name, number, seat], index) => ({
    student_id: id(index + 1),
    seat,
    invite_status: "sent",
    student: { full_name: name, student_number: number, group: { code: "204" } },
  })),
);
const sessions = parseRows(LobbySession, [
  {
    id: sid(1),
    student_id: id(1),
    state: "identity",
    status: { step: "identity", detail: "card:help:3" },
    device: { os: "macos", app_version: "1.4.2" },
    locale: "en",
  },
  {
    id: sid(2),
    student_id: id(2),
    state: "identity",
    status: { step: "identity", detail: "card:retry:2" },
    device: { os: "windows", app_version: "1.4.2" },
    locale: "kk",
  },
  {
    id: sid(3),
    student_id: id(3),
    state: "ready",
    status: { step: "ready" },
    device: { os: "windows", app_version: "1.4.2" },
    locale: "kk",
  },
]);

function helpEvent(n: number, type: CompactEvent["type"], at: string, data: Record<string, unknown>) {
  return {
    id: `0199c000-0000-7000-8000-00000000000${n}`,
    session_id: sid(1),
    exam_id: EXAM,
    type,
    source: type === "proctor.message" ? "proctor" : "app",
    review: "log",
    at,
    received_at: at,
    data,
    frame_count: 0,
  } satisfies CompactEvent;
}

function setup(
  options: { role?: "proctor" | "exam_office"; changeRequests?: ChangeRequestRow[]; fail?: boolean } = {},
) {
  const sent: CommandRequest[] = [];
  const api: FunctionsClient = {
    command: vi.fn(async (request: CommandRequest) => {
      sent.push(request);
      return options.fail
        ? { ok: false as const, code: "internal" as const }
        : { ok: true as const, data: { command_ids: ["c0000000-0000-4000-8000-000000000001"] } };
    }),
    stills: vi.fn(),
  };
  const view = renderWithIntl(
    <FunctionsClientContext value={() => api}>
      <LobbyView
        exam={exam}
        roster={roster}
        sessions={sessions}
        who={{ role: options.role ?? "proctor", isLead: true }}
        nowMs={now}
        startAction={vi.fn()}
        changeRequests={options.changeRequests}
        measureOffset={async () => null}
      />
    </FunctionsClientContext>,
    { ...DANA, role: options.role ?? "proctor" },
  );
  return { ...view, sent };
}

const row = (studentId: string) =>
  document.querySelector(`tr[data-student-id="${studentId}"]`) as HTMLElement;
const card = () => document.querySelector<HTMLElement>("[data-student-card]");

describe("1.5a Student card", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    vi.setSystemTime(now);
    helpEvents.list = [];
    helpEvents.reads = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens when the pointer rests on a row, with the step, the problem and the device, and closes on leave", async () => {
    setup();
    fireEvent.mouseEnter(row(id(1)));
    expect(card()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(HOVER_OPEN_MS + 10);
    });
    const open = card();
    if (!open) throw new Error("no card");
    const c = within(open);
    expect(c.getByRole("heading", { name: "Madina Tulegenova" })).toBeTruthy();
    expect(c.getByText("20231187 · Group 204")).toBeTruthy();
    expect(c.getByText("help")).toBeTruthy();
    expect(c.getByText("Check-in · step 2 of 4")).toBeTruthy();
    expect(c.getByText("3 of 3 tries")).toBeTruthy();
    expect([...open.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "System",
      "Identity",
      "Rules",
      "Ready",
    ]);
    expect(
      [...open.querySelectorAll("[data-step-state]")].map((bar) => bar.getAttribute("data-step-state")),
    ).toEqual(["done", "warn", "todo", "todo"]);
    expect(c.getByText("Problem")).toBeTruthy();
    expect(c.getByText("Card unreadable")).toBeTruthy();
    expect(c.getByText("macOS · Üki 1.4.2")).toBeTruthy();
    expect(c.getByRole("button", { name: "Message" })).toBeTruthy();
    expect(c.getByRole("button", { name: "Identity help" })).toBeTruthy();
    // Hovering never takes the focus away from where it was.
    expect(open.contains(document.activeElement)).toBe(false);

    fireEvent.mouseLeave(row(id(1)));
    await act(async () => {
      vi.advanceTimersByTime(HOVER_CLOSE_MS + 10);
    });
    expect(card()).toBeNull();
  });

  it("stays open while the pointer moves from the row onto the card", async () => {
    setup();
    fireEvent.mouseEnter(row(id(2)));
    await act(async () => {
      vi.advanceTimersByTime(HOVER_OPEN_MS + 10);
    });
    fireEvent.mouseLeave(row(id(2)));
    fireEvent.mouseEnter(card() as HTMLElement);
    await act(async () => {
      vi.advanceTimersByTime(HOVER_CLOSE_MS * 3);
    });
    expect(within(card() as HTMLElement).getByText("retry 2 of 3")).toBeTruthy();
  });

  it("opens on a click of the name, without Identity help for a ready student", async () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Zhansaya Omarova" }));
    const open = card() as HTMLElement;
    expect(within(open).getByText("Ready", { selector: "span" })).toBeTruthy();
    expect(within(open).getByText("Check-in · step 4 of 4")).toBeTruthy();
    expect(within(open).queryByText("Problem")).toBeNull();
    expect(within(open).queryByRole("button", { name: "Identity help" })).toBeNull();
    expect(
      [...open.querySelectorAll("[data-step-state]")].every(
        (bar) => bar.getAttribute("data-step-state") === "done",
      ),
    ).toBe(true);
    // A student who has not joined has no card: the name is plain text.
    expect(screen.queryByRole("button", { name: "Yerlan Tokhtarov" })).toBeNull();
  });
});

describe("1.5b Identity help", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    helpEvents.list = [
      helpEvent(1, "student.help_requested", "2026-10-09T04:52:05Z", { topic: "identity" }),
      helpEvent(2, "proctor.message", "2026-10-09T04:53:10Z", { text: "Hold it still", scope: "student" }),
    ];
    helpEvents.reads = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens from the card, shows the tries and the log, and Send hint issues a message command", async () => {
    const { sent, container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Madina Tulegenova" }));
    fireEvent.click(within(card() as HTMLElement).getByRole("button", { name: "Identity help" }));
    const drawer = await screen.findByRole("dialog", { name: "Identity help" });
    const d = within(drawer);
    expect(d.getByText("Madina Tulegenova · 20231187")).toBeTruthy();
    expect(d.getByText("macOS · Üki 1.4.2")).toBeTruthy();
    expect(d.getByText("3 of 3 tries")).toBeTruthy();
    await waitFor(() => expect(d.getByText("Asked for help")).toBeTruthy());
    expect(helpEvents.reads).toEqual([sid(1)]);
    expect(d.getByText("09:52:05")).toBeTruthy();
    expect(d.getByText("Message sent")).toBeTruthy();
    expect(d.getByText("“Hold it still”")).toBeTruthy();
    expect(d.getByText("You see each try’s result, never the photo.")).toBeTruthy();
    // What happens next has no plan behaviour beyond the hint, so it is not drawn.
    expect(d.queryByText("Start now, check later")).toBeNull();

    const send = d.getByRole("button", { name: "Send hint" });
    expect(send.hasAttribute("disabled")).toBe(true);
    const field = d.getByRole("textbox", { name: "Hint for Madina" });
    expect(field.getAttribute("maxlength")).toBe("200");
    expect(d.getByText("Sent in English, Madina’s app language · 0/200")).toBeTruthy();
    fireEvent.change(field, { target: { value: " Tilt the card away from the window. " } });
    expect(d.getByText("Sent in English, Madina’s app language · 37/200")).toBeTruthy();
    fireEvent.click(d.getByRole("button", { name: "Send hint" }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          session_id: sid(1),
          type: "message",
          payload: { text: "Tilt the card away from the window.", scope: "student" },
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Identity help" })).toBeNull());
    expect(await screen.findByText("Hint sent to Madina.")).toBeTruthy();
    expect(rawKeys(container)).toEqual([]);
  });

  it("keeps the drawer and the hint when the command fails", async () => {
    const { sent } = setup({ fail: true });
    fireEvent.click(screen.getByRole("button", { name: "Madina Tulegenova" }));
    fireEvent.click(within(card() as HTMLElement).getByRole("button", { name: "Identity help" }));
    const drawer = await screen.findByRole("dialog", { name: "Identity help" });
    fireEvent.change(within(drawer).getByRole("textbox"), { target: { value: "Try again" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Send hint" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.getByRole("dialog", { name: "Identity help" })).toBeTruthy();
    expect((within(drawer).getByRole("textbox") as HTMLTextAreaElement).value).toBe("Try again");
  });
});

describe("Change requests from 0.9a", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("show above the banner for the exam office, with the proctor, the seats and the note", () => {
    setup({
      role: "exam_office",
      changeRequests: [
        ChangeRequestRow.parse({
          staff_id: "57af0000-0000-4000-8000-000000000002",
          seat_from: 65,
          seat_to: 128,
          change_request: "Seats 1–64, please: I speak Kazakh.",
          staff: { full_name: "Nurlan Bekov" },
        }),
        ChangeRequestRow.parse({
          staff_id: "57af0000-0000-4000-8000-000000000003",
          seat_from: null,
          seat_to: null,
          change_request: "I am away that day.",
          staff: { full_name: "Gulnara Kassenova" },
        }),
      ],
    });
    expect(screen.getByText("Nurlan Bekov asked to change seats 65–128")).toBeTruthy();
    expect(screen.getByText("“Seats 1–64, please: I speak Kazakh.”")).toBeTruthy();
    expect(screen.getByText("Gulnara Kassenova asked for a change")).toBeTruthy();
  });
});

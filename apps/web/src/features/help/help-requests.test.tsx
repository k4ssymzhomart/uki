import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { HelpRequest } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import { DANA, intlErrors, renderWithIntl } from "../../../test/render.tsx";
import { LiveWall } from "../wall/live-wall.tsx";
import type { AnyClient } from "../wall/queries.ts";
import {
  EXAM_ID,
  fakeClient,
  initialData,
  NOW,
  sessionId,
  sessionRow,
  setupDom,
} from "../wall/test-helpers.tsx";

setupDom();

const AIGERIM = { ...DANA, fullName: "Aigerim Sadykova", role: "proctor" as const };

/** A request of session `n` (Madina Tulegenova is 1, Arman Bekzhanov 2), as the `help` broadcast carries it. */
function helpRequest(n: number, overrides: Partial<HelpRequest> = {}): HelpRequest {
  return {
    id: `4e100000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    session_id: sessionId(n),
    exam_id: EXAM_ID,
    student_id: `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    student_name: n === 1 ? "Madina Tulegenova" : "Arman Bekzhanov",
    topic: n === 1 ? "question" : "technical",
    text: n === 1 ? "Q 8: is the angle in radians or degrees?" : "My camera froze for a second.",
    created_at: new Date(NOW - (3 - n) * 60_000).toISOString(),
    reply: null,
    done_at: null,
    done_by: null,
    ...overrides,
  };
}

/** The same request as a help_requests row with its embedded student, for the catch-up read. */
function helpRow(request: HelpRequest) {
  const { student_id, student_name, ...row } = request;
  return { ...row, sessions: { student_id, students: { full_name: student_name } } };
}

function closed(request: HelpRequest, reply: string | null = null): HelpRequest {
  return {
    ...request,
    reply,
    done_at: new Date(NOW).toISOString(),
    done_by: "a5000000-0000-4000-8000-000000000001",
  };
}

/** The wall's fake client plus close_help_request, answering with the closed request. */
function clientWithRpc(open: HelpRequest[]) {
  const db = fakeClient({ help_requests: open.map(helpRow) });
  const rpc = vi.fn(async (name: string, args: { id: string; reply?: string }) => {
    const request = open.find((r) => r.id === args.id);
    if (name !== "close_help_request" || request === undefined)
      return { data: null, error: { message: "not_found" } };
    return {
      data: { ...closed(request, args.reply ?? null), message_sent: args.reply !== undefined },
      error: null,
    };
  });
  (db.client as unknown as { rpc: typeof rpc }).rpc = rpc;
  return { ...db, rpc, client: db.client as AnyClient };
}

function renderWall(open: HelpRequest[], canAnswer = true) {
  const db = clientWithRpc(open);
  const initial = initialData([sessionRow(1), sessionRow(2), sessionRow(3)]);
  renderWithIntl(
    <LiveWall
      initial={initial}
      help={{ requests: open, canAnswer }}
      getClient={() => db.client}
      measureOffset={async () => 0}
    />,
    AIGERIM,
  );
  return db;
}

async function openPopover() {
  const button = await screen.findByRole("button", { name: /^Requests · \d+$/ });
  fireEvent.click(button);
  return screen.findByRole("dialog");
}

describe("2.4d Ask proctor requests", () => {
  it("hides Requests while nothing is open", async () => {
    renderWall([]);
    expect(await screen.findByText("Live wall")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Requests/ })).toBeNull();
  });

  it("lists the open requests oldest first with reason, time, note, Reply and Mark done", async () => {
    renderWall([helpRequest(2), helpRequest(1)]);
    const popover = await openPopover();
    expect(within(popover).getByText("Requests")).toBeTruthy();
    expect(within(popover).getByText("2 open")).toBeTruthy();
    const rows = within(popover).getAllByRole("listitem");
    expect(rows[0]?.querySelector("[data-tone='lime']")?.textContent).toBe("MT");
    expect(rows[0]?.textContent).toContain("Madina T.");
    expect(rows[0]?.textContent).toContain("Question is unclear");
    expect(rows[0]?.textContent).toContain("10:45");
    expect(rows[0]?.textContent).toContain("“Q 8: is the angle in radians or degrees?”");
    expect(rows[1]?.textContent).toContain("Arman B.");
    expect(
      within(rows[1] as HTMLElement)
        .getByText("Technical problem")
        .getAttribute("data-tone"),
    ).toBe("warn");
    expect(within(popover).getAllByRole("button", { name: "Reply" })).toHaveLength(2);
    expect(within(popover).getAllByRole("button", { name: "Mark done" })).toHaveLength(2);
    expect(within(popover).getByText("Replies go to one student, in their language.")).toBeTruthy();
    expect(intlErrors).toEqual([]);
  });

  it("marks the on-screen tile of a student who asked as a raised hand", async () => {
    renderWall([helpRequest(1)]);
    const tile = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(`[data-session-id="${sessionId(1)}"]`);
      if (!found) throw new Error("no tile");
      return found;
    });
    expect(tile.textContent).toContain("raised hand · Q 1");
    expect(document.querySelector(`[data-session-id="${sessionId(2)}"]`)?.textContent).toContain(
      "on screen · Q 2",
    );
  });

  it("Mark done closes the request without a reply and clears the badge", async () => {
    const db = renderWall([helpRequest(1)]);
    const popover = await openPopover();
    fireEvent.click(within(popover).getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith("close_help_request", { id: helpRequest(1).id }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Requests/ })).toBeNull());
  });

  it("Reply sends the proctor's words through close_help_request", async () => {
    const db = renderWall([helpRequest(1)]);
    const popover = await openPopover();
    fireEvent.click(within(popover).getByRole("button", { name: "Reply" }));
    const dialog = await screen.findByRole("dialog", { name: "Reply" });
    expect(within(dialog).getByText("Goes to Madina T. as typed, without translation.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Message"), { target: { value: "Radians." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith("close_help_request", { id: helpRequest(1).id, reply: "Radians." }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reply" })).toBeNull());
    expect(screen.queryByRole("button", { name: /^Requests/ })).toBeNull();
  });

  it("follows the `help` broadcast: a new request raises the badge, a closing on another wall clears it", async () => {
    const db = renderWall([]);
    await waitFor(() => expect(db.subscribed()).toBe(true));
    act(() => db.broadcast("help", helpRequest(1)));
    expect(await screen.findByRole("button", { name: "Requests · 1" })).toBeTruthy();
    act(() => db.broadcast("help", helpRequest(2)));
    expect(await screen.findByRole("button", { name: "Requests · 2" })).toBeTruthy();
    act(() => db.broadcast("help", closed(helpRequest(1))));
    expect(await screen.findByRole("button", { name: "Requests · 1" })).toBeTruthy();
    act(() => db.broadcast("help", { nonsense: true }));
    act(() => db.broadcast("help", closed(helpRequest(2), "Yes")));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Requests/ })).toBeNull());
  });

  it("re-reads the open requests on every catch-up", async () => {
    const db = renderWall([helpRequest(1), helpRequest(2)]);
    expect(await screen.findByRole("button", { name: "Requests · 2" })).toBeTruthy();
    // help 2 was closed while this wall was away; the read after (re)subscribing finds only help 1.
    db.rows.help_requests = [helpRow(helpRequest(1))];
    act(() => db.status("SUBSCRIBED"));
    expect(await screen.findByRole("button", { name: "Requests · 1" })).toBeTruthy();
  });

  it("shows the exam office the requests without Reply and Mark done", async () => {
    renderWall([helpRequest(1)], false);
    const popover = await openPopover();
    expect(within(popover).getByText("Madina T.")).toBeTruthy();
    expect(within(popover).queryByRole("button")).toBeNull();
  });
});

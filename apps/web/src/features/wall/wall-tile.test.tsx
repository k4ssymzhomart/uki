import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CommandRequest } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import type { FunctionsClient } from "./functions-client.ts";
import {
  event,
  initialData,
  iso,
  NOW,
  renderIntl,
  sessionId,
  sessionRow,
  setupDom,
} from "./test-helpers.tsx";
import { FunctionsClientContext } from "./use-command.ts";
import { WallStoreProvider } from "./wall-store-context.tsx";
import { WallTile } from "./wall-tile.tsx";

setupDom();

const review = vi.hoisted(() => ({ decideSession: vi.fn() }));
vi.mock("../review/review-actions.ts", () => review);

function fakeFunctions() {
  const sent: CommandRequest[] = [];
  const api: FunctionsClient = {
    command: vi.fn(async (request: CommandRequest) => {
      sent.push(request);
      return { ok: true as const, data: { command_ids: [] } };
    }),
    stills: vi.fn(async () => ({ ok: true as const, data: { urls: [] } })),
  };
  return { api, sent };
}

function renderTiles(onOpenTimeline = vi.fn()) {
  const sessions = [
    sessionRow(1),
    sessionRow(2),
    sessionRow(3, { state: "paused" }),
    sessionRow(4, { last_seen_at: iso(-42_000) }),
    sessionRow(5, { status: { question: 9 } }),
    sessionRow(6, { state: "submitted" }),
  ];
  const events = [
    event(1, "phone.detected", { score: 0.94, held_ms: 6000 }, { at: iso(0) }),
    ...[0, 1, 2].map(() =>
      event(2, "gaze.off_screen", { duration_ms: 2000, direction: "left" }, { at: iso(-30_000) }),
    ),
    event(3, "session.paused", { reason: "face_missing" }, { review: "log", at: iso(-42_000) }),
  ];
  const functions = fakeFunctions();
  renderIntl(
    <FunctionsClientContext value={() => functions.api}>
      <WallStoreProvider initial={initialData(sessions, events)} nowMs={NOW}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <WallTile key={n} sessionId={sessionId(n)} onOpenTimeline={onOpenTimeline} />
        ))}
      </WallStoreProvider>
    </FunctionsClientContext>,
  );
  return { functions, onOpenTimeline };
}

function tile(n: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-session-id="${sessionId(n)}"]`);
  if (element === null) throw new Error(`no tile ${n}`);
  return element;
}

function openMenu(n: number): void {
  fireEvent.keyDown(tile(n), { key: "Enter" });
}

describe("wall tiles", () => {
  it("renders each state's status line in Figma's wording", () => {
    renderTiles();
    expect(tile(1).textContent).toContain("Madina T.");
    expect(tile(1).textContent).toContain("phone 0.94 · 10:47");
    expect(tile(1).dataset.wallState).toBe("flagged");
    expect(tile(1).dataset.tileState).toBe("flag");
    expect(tile(2).textContent).toContain("looked away 3× · 6 s");
    expect(tile(2).dataset.tileState).toBe("warn");
    expect(tile(3).textContent).toContain("no face · 00:42");
    expect(tile(3).dataset.tileState).toBe("paused");
    expect(tile(4).textContent).toContain("no signal · 00:42");
    expect(tile(4).dataset.wallState).toBe("no_signal");
    expect(tile(5).textContent).toContain("on screen · Q 9");
    expect(tile(6).textContent).toContain("submitted");
    expect(tile(6).textContent).toContain("Done");
  });

  it("opens 2.4a with the student's header; P pauses a writing student", async () => {
    const { functions } = renderTiles();
    openMenu(1);
    expect(await screen.findByText("Madina T. · 20231001")).toBeTruthy();
    expect(screen.queryByText("Watch camera")).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Mark reviewed/ }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "p" });
    await waitFor(() => expect(functions.sent).toHaveLength(1));
    expect(functions.sent[0]).toEqual({ session_id: sessionId(1), type: "pause", payload: {} });
  });

  it("shows Resume exam for a paused student and sends resume", async () => {
    const { functions } = renderTiles();
    openMenu(3);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Resume exam/ }));
    await waitFor(() =>
      expect(functions.sent).toEqual([{ session_id: sessionId(3), type: "resume", payload: {} }]),
    );
  });

  it("disables pause, message and end on a finished session", async () => {
    renderTiles();
    openMenu(6);
    const pause = await screen.findByRole("menuitem", { name: /Pause exam/ });
    expect(pause.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /End session/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /Message/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("opens the timeline with T", async () => {
    const { onOpenTimeline } = renderTiles();
    openMenu(2);
    fireEvent.keyDown(await screen.findByRole("menu"), { key: "t" });
    await waitFor(() => expect(onOpenTimeline).toHaveBeenCalledWith(sessionId(2)));
  });

  it("turns the menu into 2.4b for one student and sends a preset with its number key", async () => {
    const { functions } = renderTiles();
    openMenu(1);
    fireEvent.keyDown(await screen.findByRole("menu"), { key: "m" });
    expect(await screen.findByText("Quick message · Madina T.")).toBeTruthy();
    expect(screen.getByText("Each student reads it in their language.")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "2" });
    await waitFor(() =>
      expect(functions.sent).toEqual([
        {
          session_id: sessionId(1),
          type: "message",
          payload: { preset: "message.preset.phone_away", scope: "student" },
        },
      ]),
    );
  });

  it("asks for a reason before ending a session (2.4e)", async () => {
    const { functions } = renderTiles();
    openMenu(2);
    fireEvent.click(await screen.findByRole("menuitem", { name: /End session/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("End Arman B.’s exam?");
    expect(dialog.textContent).toContain("His answers so far are saved and he can’t continue.");
    const confirm = screen.getByRole("button", { name: "End exam" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Keep him writing" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason (required)" }), {
      target: { value: "  Second face in the frame twice, after a warning.  " },
    });
    expect(screen.getByText("Goes into the integrity report · 52/200")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End exam" }));
    await waitFor(() =>
      expect(functions.sent).toEqual([
        {
          session_id: sessionId(2),
          type: "end",
          payload: { reason: "Second face in the frame twice, after a warning." },
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Mark reviewed decides no issue, and the tile drops Flagged for the flags it covers (WP 1.8)", async () => {
    review.decideSession.mockResolvedValueOnce({
      ok: true,
      data: {
        session_id: sessionId(1),
        decision: "no_issue",
        note: null,
        reviewer_id: "c1000000-0000-4000-8000-000000000001",
        decided_at: iso(5000),
        exam_status: "live",
      },
    });
    renderTiles();
    expect(tile(1).dataset.wallState).toBe("flagged");
    openMenu(1);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Mark reviewed/ }));
    await waitFor(() => expect(tile(1).dataset.wallState).toBe("on_screen"));
    expect(review.decideSession).toHaveBeenCalledWith({ session_id: sessionId(1), decision: "no_issue" });
    // Nothing left to review: the item turns off.
    openMenu(1);
    const item = await screen.findByRole("menuitem", { name: /Mark reviewed/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Mark reviewed for a session without flags", async () => {
    renderTiles();
    openMenu(5);
    const item = await screen.findByRole("menuitem", { name: /Mark reviewed/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
  });
});

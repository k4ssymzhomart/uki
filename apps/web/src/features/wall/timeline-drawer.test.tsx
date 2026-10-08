import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { StillsRequest } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import type { FunctionsClient } from "./functions-client.ts";
import {
  event,
  fakeClient,
  initialData,
  iso,
  NOW,
  renderIntl,
  sessionId,
  sessionRow,
  setupDom,
} from "./test-helpers.tsx";
import { TimelineDrawer } from "./timeline-drawer.tsx";
import { FunctionsClientContext } from "./use-command.ts";
import type { WallStore } from "./wall-store.ts";
import { useWallStoreApi, WallStoreProvider } from "./wall-store-context.tsx";

setupDom();

const review = vi.hoisted(() => ({ addSessionNote: vi.fn() }));
vi.mock("../review/review-actions.ts", () => review);

const STAFF = "c1000000-0000-4000-8000-000000000001";
const phone = event(1, "phone.detected", { score: 0.94, held_ms: 6000 }, { at: iso(0), frame_count: 3 });
const look = event(1, "gaze.off_screen", { duration_ms: 2300, direction: "left" }, { at: iso(-248_000) });
const back = event(1, "gaze.on_screen", {}, { at: iso(11_000), review: "none" });
const urls = [0, 1].map((i) => ({
  frame_id: `f0000000-0000-4000-8000-00000000000${i}`,
  url: `http://127.0.0.1:54721/storage/v1/object/sign/frames/still-${i}.jpg?token=t`,
  captured_at: iso(i * 1000),
}));

function setup(open: boolean) {
  const stills = vi.fn(async (_request: StillsRequest) => ({ ok: true as const, data: { urls } }));
  const api: FunctionsClient = {
    command: vi.fn(async () => ({ ok: true as const, data: { command_ids: [] } })),
    stills,
  };
  const db = fakeClient({ events: [back, phone, look] });
  let store: WallStore | null = null;
  function Grab() {
    store = useWallStoreApi();
    return null;
  }
  renderIntl(
    <FunctionsClientContext value={() => api}>
      <WallStoreProvider
        initial={initialData([sessionRow(1, { status: { question: 7 } })], [phone, look])}
        nowMs={NOW}
      >
        <Grab />
        <TimelineDrawer client={db.client} sessionId={open ? sessionId(1) : null} />
      </WallStoreProvider>
    </FunctionsClientContext>,
  );
  return { stills, db, store: () => store as unknown as WallStore };
}

describe("timeline drawer (2.5)", () => {
  it("reads no stills and no timeline while closed", () => {
    const { stills, db } = setup(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(stills).not.toHaveBeenCalled();
    expect(db.queries).toEqual([]);
  });

  it("shows the header, chips, the flag card with its stills and the timeline newest first", async () => {
    const { stills } = setup(true);
    const dialog = await screen.findByRole("dialog", { name: "Madina Tulegenova" });
    expect(dialog.textContent).toContain("20231001 · seat 2 · macOS");
    expect(dialog.textContent).toContain("phone 0.94");
    expect(dialog.textContent).toContain("on screen now");
    expect(dialog.textContent).toContain("Q 7 of 20");
    await waitFor(() => expect(stills).toHaveBeenCalledWith({ event_id: phone.id }));
    expect(stills).toHaveBeenCalledTimes(1);
    // The flag card's image and the first thumbnail.
    expect(await screen.findAllByAltText("Still 1 of 2, 10:47:10")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Still 2 of 2, 10:47:11" })).toBeTruthy();
    expect(dialog.textContent).toContain("Held for 6 s");
    const rows = [...dialog.querySelectorAll("ol li")].map((li) => li.textContent);
    expect(rows[0]).toContain("On screen again");
    expect(rows[1]).toContain("Phone in frame");
    expect(rows[2]).toContain("Looked away");
    expect(rows[2]).toContain("2.3 s, to the left");
  });

  it("offers the presets in the student's language with Russian and English beneath", async () => {
    setup(true);
    const presets = await screen.findByRole("radiogroup", { name: "Quick message · sent in her language" });
    expect(presets.textContent).toContain("Телефонды алып қойыңыз");
    expect(screen.getByRole("radio", { name: "Телефонды алып қойыңыз" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByText("Уберите телефон")).toBeTruthy();
    expect(screen.getByText("Put the phone away")).toBeTruthy();
  });

  it("asks for the stills again when a new one is confirmed", async () => {
    const { stills, store } = setup(true);
    await waitFor(() => expect(stills).toHaveBeenCalledTimes(1));
    act(() => {
      store()
        .getState()
        .actions.applyFrame({
          event_id: phone.id,
          session_id: sessionId(1),
          frame_id: "f0000000-0000-4000-8000-000000000009",
          captured_at: iso(2000),
        });
    });
    await waitFor(() => expect(stills).toHaveBeenCalledTimes(2));
  });

  it("adds a note through add_session_note, and the note shows on the timeline when its event arrives (WP 1.8)", async () => {
    review.addSessionNote.mockResolvedValueOnce({ ok: true, data: "e9000000-0000-4000-8000-000000000001" });
    const { store } = setup(true);
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    const field = screen.getByRole("textbox", { name: "Note" });
    const save = screen.getAllByRole("button", { name: "Add note" }).at(-1) as HTMLElement;
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(field, { target: { value: "  Phone face down after the warning.  " } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(review.addSessionNote).toHaveBeenCalledWith({
        session_id: sessionId(1),
        text: "Phone face down after the warning.",
      }),
    );
    // Back to the quick message; the event comes through the exam channel like any other.
    expect(await screen.findByRole("button", { name: "Send" })).toBeTruthy();
    act(() => {
      store()
        .getState()
        .actions.applyEvent(
          event(
            1,
            "proctor.note",
            { text: "Phone face down after the warning.", staff_id: STAFF },
            {
              id: "e9000000-0000-4000-8000-000000000001",
              source: "proctor",
              review: "none",
              at: iso(20_000),
              received_at: iso(20_000),
            },
          ),
        );
    });
    const dialog = screen.getByRole("dialog");
    const rows = [...dialog.querySelectorAll("ol li")].map((li) => li.textContent);
    expect(rows[0]).toContain("Note");
    expect(rows[0]).toContain("“Phone face down after the warning.”");
  });

  it("keeps the note and shows an error toast when add_session_note fails", async () => {
    review.addSessionNote.mockResolvedValueOnce({ ok: false, code: "forbidden" });
    setup(true);
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Talked to her" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add note" }).at(-1) as HTMLElement);
    await waitFor(() => expect(review.addSessionNote).toHaveBeenCalled());
    expect((screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement).value).toBe(
      "Talked to her",
    );
  });
});

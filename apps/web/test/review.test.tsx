// WP 1.8: 3.2 (with 3.2a and 3.2b) and 3.3 as components, in English for behaviour and in Russian with
// no next-intl error and no raw key (the Russian render check every new dashboard page gets).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { StillsRequest } from "@uki/contracts";
import { loadMessages } from "@uki/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionReviewData } from "../src/features/review/review-data.ts";
import { buildReview } from "../src/features/review/review-model.ts";
import { ReviewQueueView } from "../src/features/review/review-queue-view.tsx";
import { SessionReviewView } from "../src/features/review/session-review-view.tsx";
import {
  at,
  decision,
  flag,
  historyFlags,
  historyInput,
  NOW,
  REVIEWER,
  sessionId,
} from "../src/features/review/test-fixtures.ts";
import type { FunctionsClient } from "../src/features/wall/functions-client.ts";
import { FunctionsClientContext } from "../src/features/wall/use-command.ts";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/review",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => router,
}));
vi.mock("next/image", () => import("./next-image-mock.tsx"));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const actions = vi.hoisted(() => ({ decideSession: vi.fn(), addSessionNote: vi.fn() }));
vi.mock("../src/features/review/review-actions.ts", () => actions);

const STILL = {
  frame_id: "f0000000-0000-4000-8000-000000000001",
  url: "http://127.0.0.1:55021/storage/v1/object/sign/frames/still-1.jpg?token=t",
  captured_at: at(12),
};

function functions(urls = [STILL]) {
  const stills = vi.fn(async (_request: StillsRequest) => ({ ok: true as const, data: { urls } }));
  const api: FunctionsClient = {
    command: vi.fn(async () => ({ ok: true as const, data: { command_ids: [] } })),
    stills,
  };
  return { api, stills };
}

function renderQueue(locale: "en" | "ru" = "en", input = historyInput()) {
  const fn = functions();
  const groups = buildReview(input, NOW);
  renderWithIntl(
    <FunctionsClientContext value={() => fn.api}>
      <ReviewQueueView groups={groups} initialFlags={[]} nowMs={NOW} />
    </FunctionsClientContext>,
    DANA,
    locale,
  );
  return fn;
}

function sessionData(seat: number, input = historyInput()): SessionReviewData {
  const [group] = buildReview(input, NOW, { keepUnflagged: true });
  if (group === undefined) throw new Error("no group");
  const events = input.flags
    .filter((f) => f.session_id === sessionId(seat))
    .concat([
      flag(
        seat,
        "proctor.note",
        50,
        { text: "Phone face down after the warning.", staff_id: REVIEWER },
        {
          source: "proctor",
          review: "none",
        },
      ),
    ])
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { group, sessionId: sessionId(seat), events, staffNames: { [REVIEWER]: "Aigerim Sadykova" } };
}

function renderSession(seat: number, locale: "en" | "ru" = "en", input = historyInput()) {
  const fn = functions();
  renderWithIntl(
    <FunctionsClientContext value={() => fn.api}>
      <SessionReviewView {...sessionData(seat, input)} />
    </FunctionsClientContext>,
    DANA,
    locale,
  );
  return fn;
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("tr[data-session-id]")];
}

beforeEach(() => {
  router.push.mockReset();
  actions.decideSession.mockReset();
  window.history.replaceState(null, "", "/review");
});

afterEach(() => {
  expect(intlErrors.map((error) => error.message)).toEqual([]);
});

describe("3.2 Review queue", () => {
  it("shows the stat cards, Flag ≠ fail. and History's queue as Row/Session draws it", () => {
    renderQueue();
    expect(screen.getByText("Review / History of Kazakhstan · Test · finished 12:00")).toBeTruthy();
    expect(screen.getByText("7 flags in total")).toBeTruthy();
    expect(screen.getByText("no decisions yet")).toBeTruthy();
    expect(screen.getByText("nothing to look at")).toBeTruthy();
    expect(screen.getByText("Flag ≠ fail.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "To review · 5" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "All · 6" })).toBeTruthy();
    const first = rows()[0] as HTMLElement;
    expect(first.dataset.sessionId).toBe(sessionId(7));
    expect(first.textContent).toContain("Madina Tulegenova");
    expect(first.textContent).toContain("Phone in frame · 0.94");
    expect(first.textContent).toContain("Needs review");
    expect(
      within(first)
        .getByRole("link", { name: /Review/ })
        .getAttribute("href"),
    ).toBe(`/review/${sessionId(7)}`);
    expect(rows().map((row) => row.textContent)).toContainEqual(expect.stringContaining("Second face · 4 s"));
  });

  it("switches tabs and finds a student on the client", () => {
    renderQueue("en", historyInput({ decisions: [decision(64, at(70))] }));
    expect(rows()).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: "Reviewed · 1" }));
    expect(rows().map((row) => row.dataset.sessionId)).toEqual([sessionId(64)]);
    expect(rows()[0]?.textContent).toContain("No issue");
    fireEvent.click(screen.getByRole("radio", { name: "All · 6" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a student" }), {
      target: { value: "arman" },
    });
    expect(rows().map((row) => row.dataset.sessionId)).toEqual([sessionId(21)]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a student" }), { target: { value: "zzz" } });
    expect(screen.getByText("No sessions match.")).toBeTruthy();
  });

  it("3.2a: filters by flag type only after Show, and keeps the choice in ?flag=", async () => {
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /Flag type/ }));
    expect(await screen.findByText("Show 7 flags")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Phone in frame" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Second face" }));
    expect(screen.getByText("Show 3 flags")).toBeTruthy();
    // Nothing changes before Show.
    expect(rows()).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show 3 flags" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(window.location.search).toBe("?flag=phone.detected%2Cface.second");
    expect(screen.getByRole("button", { name: /Flag type/ }).textContent).toContain("2");
    // Clear and Show: every type again.
    fireEvent.click(screen.getByRole("button", { name: /Flag type/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 7 flags" }));
    await waitFor(() => expect(rows()).toHaveLength(5));
    expect(window.location.search).toBe("");
  });

  it("3.2b: hovering the flags opens the preview, which asks the stills function for the top flag only", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fn = renderQueue();
      expect(fn.stills).not.toHaveBeenCalled();
      const cell = within(rows()[0] as HTMLElement).getByRole("link", { name: /Phone in frame · 0.94/ });
      fireEvent.pointerEnter(cell, { pointerType: "mouse" });
      fireEvent.focus(cell);
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      const [phone] = historyFlags().filter((f) => f.session_id === sessionId(7));
      await waitFor(() => expect(fn.stills).toHaveBeenCalledTimes(1));
      expect(fn.stills.mock.calls[0]?.[0].event_id).toBeTruthy();
      expect(await screen.findByText("Madina T. · phone in frame")).toBeTruthy();
      expect(screen.getByText("Held for 6 s")).toBeTruthy();
      expect(screen.getByRole("link", { name: /Open review/ }).getAttribute("href")).toBe(
        `/review/${sessionId(7)}`,
      );
      expect(phone).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("3.3 Session review", () => {
  it("shows the chips, the stamp, one card per flag and the timeline with the note", async () => {
    const fn = renderSession(7);
    expect(screen.getByText("Review / History of Kazakhstan · Test / 1 of 5")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Madina Tulegenova" })).toBeTruthy();
    expect(screen.getByText("2 flags")).toBeTruthy();
    expect(screen.getByText("identity matched")).toBeTruthy();
    expect(screen.getByText("42 of 60 min")).toBeTruthy();
    expect(screen.getByText("no video stored")).toBeTruthy();
    await waitFor(() => expect(fn.stills).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("11:12:00 · phone 0.94 · frame 1 of 1")).toBeTruthy();
    const cards = within(screen.getByRole("list", { name: "Flags" })).getAllByRole("button");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "Show Phone in frame at 11:12:00",
      "Show Looked away at 11:18:00",
    ]);
    expect(screen.getByText("Held for 6 s")).toBeTruthy();
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline.textContent).toContain("“Phone face down after the warning.”");
    fireEvent.click(cards[1] as HTMLElement);
    expect(screen.getByText("11:18:00 · gaze 4.2 s · frame 1 of 1")).toBeTruthy();
  });

  it("saves one of three decisions with a note through decide_session and opens the next session", async () => {
    actions.decideSession.mockResolvedValueOnce({ ok: true, data: {} });
    renderSession(7);
    const save = screen.getByRole("button", { name: "Save and next" });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Ask about the phone in frame at 11:12.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Talk to the student" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "  Phone face down after the warning.  " },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(actions.decideSession).toHaveBeenCalledWith({
        session_id: sessionId(7),
        decision: "talk",
        note: "Phone face down after the warning.",
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/review/${sessionId(33)}`));
  });

  it("keeps the form and shows an error when decide_session refuses; Skip moves on without deciding", async () => {
    actions.decideSession.mockResolvedValueOnce({ ok: false, code: "forbidden" });
    renderSession(64);
    fireEvent.click(screen.getByRole("radio", { name: "No issue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and next" }));
    expect(await screen.findByText("You can’t review this session.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(router.push).toHaveBeenCalledWith(`/review/${sessionId(7)}`);
  });

  it("opens with the saved decision and goes back to the queue when nothing is left", () => {
    const input = historyInput({
      decisions: [7, 21, 33, 48, 64].map((seat) =>
        decision(seat, at(70), seat === 64 ? { decision: "committee", note: "Camera off twice." } : {}),
      ),
    });
    renderSession(64, "en", input);
    expect(screen.getByText("Review / History of Kazakhstan · Test")).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Send to the exam committee" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect((screen.getByRole("textbox", { name: "Note" }) as HTMLInputElement).value).toBe(
      "Camera off twice.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(router.push).toHaveBeenCalledWith("/review");
  });
});

describe("3.2 and 3.3 in Russian", () => {
  const ru = loadMessages("ru") as unknown as { dashboard: { review: Record<string, unknown> } };
  const expectRussian = () => {
    expect(rawKeys(document.body)).toEqual([]);
    expect(document.body.textContent).toMatch(/[А-Яа-яЁё]/);
  };

  it("renders 3.2 with 3.2a open", async () => {
    renderQueue("ru", historyInput({ decisions: [decision(64, at(70), { decision: "talk" })] }));
    expect(screen.getByRole("heading", { level: 1, name: "Проверка" })).toBeTruthy();
    expect(screen.getByText("Отметка ≠ нарушение.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "К проверке · 4" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Проверено · 1" }));
    expect(rows()[0]?.textContent).toContain("Беседа");
    fireEvent.click(screen.getByRole("button", { name: /Тип отметки/ }));
    expect(await screen.findByText("Показать 1 отметку")).toBeTruthy();
    expectRussian();
    expect(ru.dashboard.review).toBeTruthy();
  });

  it("renders 3.3 with the decision form", async () => {
    const fn = renderSession(48, "ru");
    await waitFor(() => expect(fn.stills).toHaveBeenCalled());
    expect(screen.getByText("Ваше решение")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Передать в экзаменационную комиссию" })).toBeTruthy();
    expect(screen.getByText("2 отметки")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Сохранить и дальше" })).toBeTruthy();
    expectRussian();
  });
});

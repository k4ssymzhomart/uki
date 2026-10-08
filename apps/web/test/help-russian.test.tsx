// WP 1.6: 2.4d renders in Russian with no missing key, like every other dashboard page (WP 1.2's
// russian.test.tsx). The wall with the Requests button, the popover with both requests, a raised hand
// on a tile, and the Reply dialog; the test fails on any next-intl error and any raw dashboard.* key.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { HelpRequest } from "@uki/contracts";
import { loadMessages } from "@uki/i18n";
import { describe, expect, it } from "vitest";
import { LiveWall } from "../src/features/wall/live-wall.tsx";
import {
  EXAM_ID,
  fakeClient,
  initialData,
  NOW,
  sessionId,
  sessionRow,
  setupDom,
} from "../src/features/wall/test-helpers.tsx";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

setupDom();

const ru = loadMessages("ru").dashboard.wall;

function request(n: number, topic: HelpRequest["topic"], text: string | null): HelpRequest {
  return {
    id: `4e100000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    session_id: sessionId(n),
    exam_id: EXAM_ID,
    student_id: `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    student_name: n === 1 ? "Madina Tulegenova" : "Arman Bekzhanov",
    topic,
    text,
    created_at: new Date(NOW - n * 60_000).toISOString(),
    reply: null,
    done_at: null,
    done_by: null,
  };
}

describe("2.4d in Russian", () => {
  it("renders the Requests button, the popover, a raised hand and the Reply dialog", async () => {
    const open = [request(1, "question", "Вопрос 8: в радианах или в градусах?"), request(2, "break", null)];
    const db = fakeClient({
      help_requests: open.map(({ student_id, student_name, ...row }) => ({
        ...row,
        sessions: { student_id, students: { full_name: student_name } },
      })),
    });
    renderWithIntl(
      <LiveWall
        initial={initialData([sessionRow(1), sessionRow(2)])}
        help={{ requests: open, canAnswer: true }}
        getClient={() => db.client}
        measureOffset={async () => 0}
      />,
      { ...DANA, role: "proctor" },
      "ru",
    );
    const button = await screen.findByRole("button", { name: "Запросы · 2" });
    await waitFor(() =>
      expect(document.querySelector(`[data-session-id="${sessionId(1)}"]`)?.textContent).toContain(
        "поднята рука · вопрос 1",
      ),
    );
    fireEvent.click(button);
    const popover = await screen.findByRole("dialog");
    expect(within(popover).getByText(ru.help.title)).toBeTruthy();
    expect(within(popover).getByText("открыто: 2")).toBeTruthy();
    expect(within(popover).getByText("Вопрос непонятен")).toBeTruthy();
    expect(within(popover).getByText("Мне нужен перерыв")).toBeTruthy();
    expect(within(popover).getByText("«Вопрос 8: в радианах или в градусах?»")).toBeTruthy();
    expect(within(popover).getAllByRole("button", { name: ru.help.done })).toHaveLength(2);
    expect(within(popover).getByText(ru.help.footer)).toBeTruthy();

    fireEvent.click(within(popover).getAllByRole("button", { name: ru.help.reply })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: ru.help.reply });
    expect(within(dialog).getByRole("button", { name: ru.message.send })).toBeTruthy();

    expect(intlErrors.map((error) => error.message)).toEqual([]);
    expect(rawKeys(document.body)).toEqual([]);
  });
});

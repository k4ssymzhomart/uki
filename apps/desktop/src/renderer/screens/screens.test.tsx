import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BCP47, formats, LOCALES, type Locale, loadMessages, TIME_ZONE } from "@uki/i18n";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExamModel, FlowUiEvent, Frame, JoinModel, ScreenModel } from "../flow/view-model.ts";
import { FRAMES, fixture } from "./fixtures.ts";
import { StudentScreen } from "./student-screen.tsx";

beforeAll(() => {
  // Radix measures controls with ResizeObserver, which jsdom lacks.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(cleanup);

/** Every message key path, to prove no screen prints a raw key ("join.title"). */
function keyPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, value]) => keyPaths(value, prefix ? `${prefix}.${key}` : key));
}
const KEYS = keyPaths(loadMessages("en"));

function renderIn(locale: Locale, ui: ReactNode) {
  const errors: string[] = [];
  const view = render(
    <IntlProvider
      locale={BCP47[locale]}
      messages={loadMessages(locale)}
      timeZone={TIME_ZONE}
      formats={formats}
      onError={(error) => errors.push(error.message)}
    >
      {ui}
    </IntlProvider>,
  );
  return { ...view, errors };
}

function renderFrame(frame: Frame, locale: Locale = "en", model: ScreenModel = fixture(frame, locale)) {
  const send = vi.fn<(event: FlowUiEvent) => void>();
  const view = renderIn(locale, <StudentScreen model={model} send={send} os="macos" />);
  return { ...view, send };
}

function messages(locale: Locale) {
  return loadMessages(locale);
}

describe("every frame in every language", () => {
  for (const locale of LOCALES) {
    for (const frame of FRAMES) {
      it(`${frame} renders in ${locale} with every message found and no raw key`, () => {
        const { container, errors } = renderFrame(frame, locale);
        expect(errors).toEqual([]);
        expect(container.querySelector(`[data-frame="${frame}"]`)).not.toBeNull();
        const text = container.textContent ?? "";
        const raw = KEYS.filter((key) => text.includes(key));
        expect(raw).toEqual([]);
      });
    }
  }

  it("speaks the student's language: the 1.1 heading in kk, ru and en", () => {
    for (const locale of LOCALES) {
      renderFrame("1.1", locale);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(messages(locale).join.title);
      cleanup();
    }
  });

  it("formats counts with the catalog plurals: 1.3a tries and 3.1 flags in Russian", () => {
    renderFrame("1.3a", "ru");
    expect(screen.getByText(/за 3 попытки/)).toBeTruthy();
    cleanup();
    renderFrame("3.1", "ru");
    expect(screen.getByText("3 · их проверит человек")).toBeTruthy();
  });

  it("writes times and dates in Asia/Almaty", () => {
    renderFrame("3.1", "en");
    expect(screen.getByText("11:28:04 · Fri 9 Oct")).toBeTruthy();
  });
});

describe("title bar", () => {
  it("names the app alone before a join (1.1)", () => {
    for (const locale of LOCALES) {
      const { container } = renderFrame("1.1", locale);
      expect(within(container).getByText(messages(locale).app.name)).toBeTruthy();
      cleanup();
    }
  });

  it("says browser locked while offline only when Üki Lock locked the browser (2.1a)", () => {
    const locked = fixture("2.1a", "en") as ExamModel;
    renderFrame("2.1a", "en", locked);
    expect(screen.getByText(/ · browser locked · offline$/)).toBeTruthy();
    cleanup();
    renderFrame("2.1a", "en", { ...locked, browserLocked: null });
    expect(screen.queryByText(/browser locked/)).toBeNull();
    expect(screen.getByText(/^Üki · .+ · offline$/)).toBeTruthy();
  });
});

describe("Ask proctor", () => {
  it("shows only on 1.3 in Phase 0", () => {
    for (const frame of FRAMES) {
      renderFrame(frame, "en");
      const buttons = screen.queryAllByRole("button", { name: messages("en").action.ask_proctor });
      expect(buttons.length, frame).toBe(frame === "1.3" ? 1 : 0);
      cleanup();
    }
  });

  it("sends ASK_PROCTOR on 1.3", () => {
    const { send } = renderFrame("1.3");
    fireEvent.click(screen.getByRole("button", { name: messages("en").action.ask_proctor }));
    expect(send).toHaveBeenCalledWith({ type: "ASK_PROCTOR" });
  });
});

describe("callbacks", () => {
  const en = messages("en");

  it("1.1 joins with the normalised code and student ID", () => {
    const { send } = renderFrame("1.1");
    fireEvent.change(screen.getByLabelText(en.join.code.label), { target: { value: " math2-204-fri " } });
    fireEvent.click(screen.getByRole("button", { name: en.action.continue }));
    expect(send).toHaveBeenCalledWith({ type: "JOIN", code: "MATH2-204-FRI", studentNumber: "20231187" });
  });

  it("1.1 refuses a student ID that is not 8 digits and says why", () => {
    const { send } = renderFrame("1.1");
    const id = screen.getByLabelText(en.join.student_id.label);
    fireEvent.change(id, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: en.action.continue }));
    expect(send).not.toHaveBeenCalled();
    expect(id.getAttribute("aria-invalid")).toBe("true");
  });

  it("1.1a shows the wrong-code error on the code field", () => {
    renderFrame("1.1a");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(en.join.error.title);
    const code = screen.getByLabelText(en.join.code.label);
    expect(code.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(en.join.error.body)).toBeTruthy();
  });

  it.each([
    ["lobby_closed", "code"],
    ["rate_limited", "code"],
    ["network", "code"],
    ["already_joined", "student ID"],
  ] as const)("1.1 shows %s from join_exam on the %s field", (error, field) => {
    renderFrame("1.1", "en", { ...(fixture("1.1", "en") as JoinModel), error });
    const label = field === "code" ? en.join.code.label : en.join.student_id.label;
    expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(en.join.error[error])).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(en.join.title);
  });

  it("1.4 opens the video question to its answer (1.4a)", () => {
    const kk = messages("kk");
    renderFrame("1.4", "kk");
    const answer = screen.getByText(kk.rules.faq.video.answer);
    expect(answer.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: kk.rules.faq.video.question }));
    expect(answer.hidden).toBe(false);
  });

  it("the language switch sends SET_LOCALE", () => {
    const { send } = renderFrame("1.2");
    fireEvent.click(screen.getByText("РУС"));
    expect(send).toHaveBeenCalledWith({ type: "SET_LOCALE", locale: "ru" });
  });

  it("1.2 checks again, and Continue waits for every row", () => {
    const { send } = renderFrame("1.2");
    fireEvent.click(screen.getByRole("button", { name: en.check.again }));
    expect(send).toHaveBeenCalledWith({ type: "CHECK_AGAIN" });
    const next = screen.getByRole("button", { name: en.action.continue }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    cleanup();
    const ready = { ...fixture("1.2"), canContinue: true } as ScreenModel;
    const second = renderFrame("1.2", "en", ready);
    fireEvent.click(screen.getByRole("button", { name: en.action.continue }));
    expect(second.send).toHaveBeenCalledWith({ type: "CONTINUE" });
  });

  it("1.4 sends the agree box", () => {
    const { send } = renderFrame("1.4");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(send).toHaveBeenCalledWith({ type: "SET_AGREED", agreed: false });
  });

  it("2.1 picks a choice, goes back and on, and submits on the last question", () => {
    const { send } = renderFrame("2.1");
    fireEvent.click(screen.getByRole("radio", { name: "3x − 4" }));
    expect(send).toHaveBeenCalledWith({ type: "SELECT_CHOICE", questionId: "q7", choiceId: "d" });
    fireEvent.click(screen.getByRole("button", { name: en.exam.back }));
    expect(send).toHaveBeenCalledWith({ type: "PREV_QUESTION" });
    fireEvent.click(screen.getByRole("button", { name: en.exam.next }));
    expect(send).toHaveBeenCalledWith({ type: "NEXT_QUESTION" });
    cleanup();
    const last = { ...(fixture("2.1") as ExamModel), isLast: true };
    const second = renderFrame("2.1", "en", last);
    fireEvent.click(screen.getByRole("button", { name: en.exam.submit }));
    expect(second.send).toHaveBeenCalledWith({ type: "SUBMIT" });
  });

  it("2.1 says when the questions did not load, in every language, and Check again retries", () => {
    const failed = (locale: Locale, loading = false): ExamModel => ({
      ...(fixture("2.1", locale) as ExamModel),
      question: null,
      questionsFailed: true,
      questionsLoading: loading,
    });
    for (const locale of LOCALES) {
      const { send, errors, container } = renderFrame("2.1", locale, failed(locale));
      expect(errors).toEqual([]);
      const banner = screen.getByRole("alert");
      expect(banner.getAttribute("data-kind")).toBe("error");
      expect(banner.textContent).toContain(messages(locale).exam.questions.failed);
      fireEvent.click(within(banner).getByRole("button", { name: messages(locale).check.again }));
      expect(send).toHaveBeenCalledWith({ type: "RETRY_QUESTIONS" });
      // The banner replaces the pane's spinner.
      expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
      cleanup();
    }
    // While that try runs, Check again shows its spinner and ignores clicks.
    const { send } = renderFrame("2.1", "en", failed("en", true));
    const button = within(screen.getByRole("alert")).getByRole("button", { name: en.check.again });
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(send).not.toHaveBeenCalled();
    cleanup();
    // Loading for the first time: the spinner alone, no banner.
    const first = renderFrame("2.1", "en", { ...failed("en", true), questionsFailed: false });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(first.container.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it("2.1e Got it acknowledges the message", () => {
    const { send } = renderFrame("2.1e");
    fireEvent.click(screen.getByRole("button", { name: en.message.ack }));
    expect(send).toHaveBeenCalledWith({ type: "ACK_NOTICE" });
  });

  it("2.2 shows the phone HUD", () => {
    renderFrame("2.2");
    expect(screen.getByText(en.exam.phone.toast)).toBeTruthy();
  });

  it("2.3 I'm here resumes, and is disabled until a face is back", () => {
    const { send } = renderFrame("2.3");
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: en.exam.paused.resume }));
    expect(send).toHaveBeenCalledWith({ type: "IM_HERE" });
    cleanup();
    const model = fixture("2.3") as ExamModel;
    const waiting = { ...model, selfPause: model.selfPause && { ...model.selfPause, canResume: false } };
    renderFrame("2.3", "en", waiting);
    const button = screen.getByRole("button", { name: en.exam.paused.resume }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("2.1c tells the student only the proctor resumes", () => {
    renderFrame("2.1c");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(en.proctor_paused.title)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: en.exam.paused.resume })).toBeNull();
  });

  it("3.1 and 2.1d save the receipt and close, and mark the receipt for printing", () => {
    for (const frame of ["3.1", "2.1d"] as const) {
      const { send, container } = renderFrame(frame);
      fireEvent.click(screen.getByRole("button", { name: en.done.save }));
      fireEvent.click(screen.getByRole("button", { name: en.done.close }));
      expect(send).toHaveBeenCalledWith({ type: "SAVE_RECEIPT" });
      expect(send).toHaveBeenCalledWith({ type: "CLOSE_APP" });
      expect(container.querySelectorAll("[data-uki-receipt]").length).toBe(1);
      // The main process's receipt.savePdf finds the card by this marker and names the file by the id.
      const card = container.querySelector('[data-uki-print="receipt"]');
      expect(card).not.toBeNull();
      expect(card?.getAttribute("data-uki-receipt-id")).toMatch(/^UKI-/);
      cleanup();
    }
  });
});

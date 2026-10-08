import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../controls/button.tsx";
import { LockBar } from "../lock/lock-bar.tsx";
import { AskProctorPanel, type AskProctorPanelProps } from "./ask-proctor-panel.tsx";
import { HelpRequestRow, HelpRequestsPopover } from "./help-requests.tsx";

function panel(overrides: Partial<AskProctorPanelProps> = {}) {
  const props: AskProctorPanelProps = {
    title: "Ask your proctor",
    body: "Your proctor sees this on the live wall. Your time keeps running.",
    closeLabel: "Close",
    onClose: vi.fn(),
    reasons: [
      { value: "question", label: "Question is unclear" },
      { value: "technical", label: "Technical problem" },
      { value: "break", label: "I need a break" },
      { value: "other", label: "Something else" },
    ],
    reason: null,
    onReasonChange: vi.fn(),
    noteLabel: "Note (optional)",
    note: "",
    onNoteChange: vi.fn(),
    noteMax: 200,
    noteHelper: "Only your proctor sees this · 0/200",
    cancelLabel: "Cancel",
    sendLabel: "Send to proctor",
    onSend: vi.fn(),
    ...overrides,
  };
  render(<AskProctorPanel {...props} />);
  return props;
}

describe("AskProctorPanel (E.5a)", () => {
  it("offers the four reasons as a radio group and keeps Send off until one is chosen", () => {
    const props = panel();
    expect(screen.getByRole("dialog", { name: "Ask your proctor" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Question is unclear",
      "Technical problem",
      "I need a break",
      "Something else",
    ]);
    expect((screen.getByRole("button", { name: "Send to proctor" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("radio", { name: "I need a break" }));
    expect(props.onReasonChange).toHaveBeenCalledWith("break");
  });

  it("marks the chosen reason, limits the note and sends", () => {
    const props = panel({ reason: "technical", note: "The calculator tab doesn’t open." });
    const chosen = screen.getByRole("radio", { name: "Technical problem" });
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    expect(chosen.className).toContain("bg-brand");
    const note = screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
    expect(note.maxLength).toBe(200);
    fireEvent.change(note, { target: { value: "Calculator" } });
    expect(props.onNoteChange).toHaveBeenCalledWith("Calculator");
    fireEvent.click(screen.getByRole("button", { name: "Send to proctor" }));
    expect(props.onSend).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the confirmation in place of the form", () => {
    panel({ confirmation: <p>Help requested at 10:47</p> });
    expect(screen.getByText("Help requested at 10:47")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to proctor" })).toBeNull();
  });
});

describe("HelpRequestsPopover (2.4d)", () => {
  it("lists requests with their reason, time, note and actions under a count and a footer", () => {
    const done = vi.fn();
    render(
      <HelpRequestsPopover
        open
        trigger={<Button variant="brand">Requests · 2</Button>}
        title="Requests"
        count="2 open"
        footer="Replies go to one student, in their language."
      >
        <HelpRequestRow
          initials="KR"
          name="Kamila R."
          reason="Question is unclear"
          reasonTone="brand"
          time="10:46"
          text="“Q 8: is the angle in radians or degrees?”"
          actions={<Button onClick={done}>Mark done</Button>}
        />
        <HelpRequestRow
          initials="ST"
          name="Saule T."
          reason="Technical problem"
          reasonTone="warn"
          time="10:44"
        />
      </HelpRequestsPopover>,
    );
    expect(screen.getByRole("heading", { name: "Requests" })).toBeTruthy();
    expect(screen.getByText("2 open")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Technical problem").getAttribute("data-tone")).toBe("warn");
    expect(screen.getByText("Question is unclear").className).toContain("bg-brand-subtle");
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Replies go to one student, in their language.")).toBeTruthy();
  });
});

describe("LockBar Ask proctor (E.5a)", () => {
  const base = {
    badge: "LOCKED",
    exam: "Physics 1 · Quiz 3",
    tabs: [{ id: "portal", icon: "globe", label: "Exam portal", active: true }] as const,
    watching: "Üki watching",
    time: "26:14",
    timeLabel: "left",
  };

  it("stays hidden without a handler, and turns lime while the sheet is open", () => {
    const { rerender } = render(<LockBar {...base} askProctorLabel="Ask proctor" />);
    expect(screen.queryByRole("button", { name: "Ask proctor" })).toBeNull();
    const onAsk = vi.fn();
    rerender(<LockBar {...base} askProctorLabel="Ask proctor" onAskProctor={onAsk} />);
    const button = screen.getByRole("button", { name: "Ask proctor" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(onAsk).toHaveBeenCalledTimes(1);
    rerender(<LockBar {...base} askProctorLabel="Ask proctor" onAskProctor={onAsk} askProctorActive />);
    expect(screen.getByRole("button", { name: "Ask proctor" }).className).toContain("bg-brand");
  });
});

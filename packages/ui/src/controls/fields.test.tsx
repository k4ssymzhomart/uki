import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./field.tsx";
import { Input } from "./input.tsx";
import { TextArea } from "./text-area.tsx";

describe("Input", () => {
  it("is labelled by its label and described by its helper", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Exam title" helper="Students see this name in the app." onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Exam title" });
    const helper = screen.getByText("Students see this name in the app.");
    expect(input.getAttribute("aria-describedby")).toBe(helper.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    await user.type(input, "Maths");
    expect((input as HTMLInputElement).value).toBe("Maths");
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("focuses when its label is clicked", async () => {
    const user = userEvent.setup();
    render(<Input label="Exam title" />);
    await user.click(screen.getByText("Exam title"));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Exam title" }));
  });

  it("shows the error instead of the helper and marks the field invalid", () => {
    const { container } = render(
      <Input label="Exam title" helper="Students see this name in the app." error="Use 3–80 characters." />,
    );
    const input = screen.getByRole("textbox", { name: "Exam title" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const error = screen.getByText("Use 3–80 characters.");
    expect(error.className).toContain("text-fg-danger");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(screen.queryByText("Students see this name in the app.")).toBeNull();
    expect(container.querySelector(".inset-ring-flag")).not.toBeNull();
  });

  it("cannot be typed in when disabled", async () => {
    const user = userEvent.setup();
    const { container } = render(<Input label="Exam title" defaultValue="Mathematics 2" disabled />);
    const input = screen.getByRole("textbox", { name: "Exam title" }) as HTMLInputElement;
    await user.type(input, "x");
    expect(input.value).toBe("Mathematics 2");
    expect(container.querySelector(".bg-subtle")).not.toBeNull();
  });

  it("keeps a caller's aria-describedby and draws the trailing icon", () => {
    const { container } = render(
      <>
        <p id="extra">Extra</p>
        <Input label="Language" helper="Pick one" aria-describedby="extra" trailingIcon="chevron-down" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Language" });
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain("extra");
    expect(container.querySelector("[data-icon=chevron-down]")).not.toBeNull();
  });
});

describe("TextArea", () => {
  it("is a labelled multi-line field with the helper as its description", async () => {
    const user = userEvent.setup();
    render(<TextArea label="Note for the reviewer" helper="55/500" />);
    const textarea = screen.getByRole("textbox", { name: "Note for the reviewer" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.getAttribute("aria-describedby")).toBe(screen.getByText("55/500").id);
    await user.type(textarea, "Line one{Enter}Line two");
    expect((textarea as HTMLTextAreaElement).value).toBe("Line one\nLine two");
  });

  it("marks errors and blocks typing when disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TextArea label="Reason" error="Write a reason." />);
    expect(screen.getByRole("textbox", { name: "Reason" }).getAttribute("aria-invalid")).toBe("true");
    rerender(<TextArea label="Reason" disabled defaultValue="" />);
    const textarea = screen.getByRole("textbox", { name: "Reason" }) as HTMLTextAreaElement;
    await user.type(textarea, "x");
    expect(textarea.value).toBe("");
  });
});

describe("Field", () => {
  it("puts an action at the end of the label row, outside the label", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    render(
      <Field
        controlId="share"
        messageId="share-message"
        label="Share with the committee"
        state="default"
        action={
          <button type="button" onClick={onRevoke}>
            Revoke
          </button>
        }
      >
        <input id="share" readOnly value="https://uki.test/r/abc" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Share with the committee" });
    const revoke = screen.getByRole("button", { name: "Revoke" });
    expect(revoke.closest("label")).toBeNull();
    expect(revoke.parentElement).toBe(screen.getByText("Share with the committee").parentElement);
    expect(revoke.parentElement).not.toBe(input.parentElement);
    await user.click(revoke);
    expect(onRevoke).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(input);
  });

  it("keeps the label alone when there is no action", () => {
    render(
      <Field controlId="share" messageId="share-message" label="Share with the committee" state="default">
        <input id="share" readOnly />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Share with the committee" });
    expect(screen.getByText("Share with the committee").parentElement).toBe(input.parentElement);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

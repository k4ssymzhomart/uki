import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox.tsx";
import { RadioGroup } from "./radio-group.tsx";
import { RadioOption } from "./radio-option.tsx";
import { Toggle } from "./toggle.tsx";

describe("Checkbox", () => {
  it("toggles with a click, its label and the space bar", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="I agree" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "I agree" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    await user.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByText("I agree"));
    expect(box.getAttribute("aria-checked")).toBe("false");
    box.focus();
    await user.keyboard(" ");
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(onCheckedChange.mock.calls.map((call) => call[0])).toEqual([true, false, true]);
  });

  it("shows the tick only when checked", () => {
    const { container, rerender } = render(<Checkbox label="I agree" checked={false} />);
    expect(container.querySelector("svg")).toBeNull();
    rerender(<Checkbox label="I agree" checked />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("does not toggle when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="I agree" disabled onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "I agree" });
    await user.click(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(box).toHaveProperty("disabled", true);
  });
});

describe("RadioGroup and RadioOption", () => {
  function Decision({ onValueChange }: { onValueChange?: (value: string) => void }) {
    return (
      <RadioGroup aria-label="Decision" defaultValue="none" onValueChange={onValueChange}>
        <RadioOption value="none" title="No issue" detail="The phone was on the desk, face down." />
        <RadioOption value="breach" title="Breach" detail="The student used the phone." />
        <RadioOption value="later" title="Decide later" disabled />
      </RadioGroup>
    );
  }

  it("names each option by its title and describes it by its detail", () => {
    render(<Decision />);
    const option = screen.getByRole("radio", { name: "No issue" });
    expect(option.getAttribute("aria-checked")).toBe("true");
    const detail = screen.getByText("The phone was on the desk, face down.");
    expect(option.getAttribute("aria-describedby")).toBe(detail.id);
    expect(screen.getByRole("radiogroup", { name: "Decision" })).toBeTruthy();
  });

  it("selects with a click and moves with the arrow keys, skipping disabled options", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Decision onValueChange={onValueChange} />);
    await user.click(screen.getByRole("radio", { name: "Breach" }));
    expect(onValueChange).toHaveBeenLastCalledWith("breach");
    // Radix checks a radio when it gets focus while an arrow key is down, so hold each key until it has.
    const press = async (key: string, expected: string) => {
      await user.keyboard(`{${key}>}`);
      await waitFor(() =>
        expect(screen.getByRole("radio", { name: expected }).getAttribute("aria-checked")).toBe("true"),
      );
      await user.keyboard(`{/${key}}`);
    };
    await press("ArrowUp", "No issue");
    await press("ArrowDown", "Breach");
    // The disabled option is skipped: the focus wraps round to the first option.
    await press("ArrowDown", "No issue");
    expect(screen.getByRole("radio", { name: "Decide later" }).getAttribute("aria-checked")).toBe("false");
    expect(onValueChange.mock.calls.map((call) => call[0])).toEqual(["breach", "none", "breach", "none"]);
  });
});

describe("Toggle", () => {
  it("is a switch that flips with a click and the space bar", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Toggle aria-label="Sound" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "Sound" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(onCheckedChange.mock.calls.map((call) => call[0])).toEqual([true, false]);
  });

  it("does not flip when disabled", async () => {
    const user = userEvent.setup();
    render(<Toggle aria-label="Sound" disabled defaultChecked />);
    const toggle = screen.getByRole("switch", { name: "Sound" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});

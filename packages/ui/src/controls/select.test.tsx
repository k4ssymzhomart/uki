import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./select.tsx";
import { SelectItem } from "./select-item.tsx";

function Language({
  onValueChange,
  disabled,
  error,
}: {
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <Select
      label="Rules language"
      icon="globe"
      defaultValue="kk"
      onValueChange={onValueChange}
      disabled={disabled}
      error={error}
      helper="Students read the rules in this language."
    >
      <SelectItem value="kk" icon="globe" meta="ҚАЗ">
        Қазақша
      </SelectItem>
      <SelectItem value="ru" icon="globe" meta="РУС">
        Русский
      </SelectItem>
      <SelectItem value="en" icon="globe" meta="ENG">
        English
      </SelectItem>
    </Select>
  );
}

describe("Select", () => {
  it("is a combobox named by its label showing the chosen option", () => {
    render(<Language />);
    const trigger = screen.getByRole("combobox", { name: "Rules language" });
    expect(trigger.textContent).toContain("Қазақша");
    expect(trigger.getAttribute("aria-describedby")).toBe(
      screen.getByText("Students read the rules in this language.").id,
    );
  });

  it("opens with the keyboard and picks an option", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Language onValueChange={onValueChange} />);
    const trigger = screen.getByRole("combobox", { name: "Rules language" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeTruthy();
    expect(screen.getByRole("option", { name: /Қазақша/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("option", { name: /Русский/ }));
    expect(onValueChange).toHaveBeenCalledWith("ru");
    expect(screen.getByRole("combobox", { name: "Rules language" }).textContent).toContain("Русский");
  });

  it("shows the selected option's check icon in the list", async () => {
    const user = userEvent.setup();
    render(<Language />);
    screen.getByRole("combobox", { name: "Rules language" }).focus();
    await user.keyboard("{Enter}");
    const selected = await screen.findByRole("option", { name: /Қазақша/ });
    expect(selected.querySelector("[data-icon=check]")).not.toBeNull();
    expect(screen.getByRole("option", { name: /English/ }).querySelector("[data-icon=check]")).toBeNull();
  });

  it("marks errors and cannot open when disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Language error="Pick a language." />);
    expect(screen.getByRole("combobox", { name: "Rules language" }).getAttribute("aria-invalid")).toBe(
      "true",
    );
    rerender(<Language disabled />);
    const trigger = screen.getByRole("combobox", { name: "Rules language" });
    expect(trigger).toHaveProperty("disabled", true);
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

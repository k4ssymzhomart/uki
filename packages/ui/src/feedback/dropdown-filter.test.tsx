import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DropdownFilter, type DropdownFilterOption } from "./dropdown-filter.tsx";

// Sample strings and counts are Figma's Dropdown/Filter 76:2284 in 3.2a.
function Filter({ onApply }: { onApply: (ids: string[]) => void }) {
  const [options, setOptions] = useState<DropdownFilterOption[]>([
    { id: "phone", label: "Phone in frame", count: 2, checked: true },
    { id: "face", label: "Second face", count: 1, checked: false },
  ]);
  return (
    <DropdownFilter
      trigger={<button type="button">Flag type</button>}
      header="Flag type"
      options={options}
      onCheckedChange={(id, checked) =>
        setOptions((current) => current.map((o) => (o.id === id ? { ...o, checked } : o)))
      }
      clearLabel="Clear"
      onClear={() => setOptions((current) => current.map((o) => ({ ...o, checked: false })))}
      applyLabel={`Show ${options.filter((o) => o.checked).reduce((sum, o) => sum + Number(o.count), 0)} flags`}
      onApply={() => onApply(options.filter((o) => o.checked).map((o) => o.id))}
    />
  );
}

describe("DropdownFilter", () => {
  it("lists the options with their counts, and applies only on the button", async () => {
    const onApply = vi.fn();
    render(<Filter onApply={onApply} />);
    await userEvent.click(screen.getByRole("button", { name: "Flag type" }));
    expect(await screen.findByText("Show 2 flags")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Phone in frame" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Second face" }));
    expect(screen.getByText("Show 3 flags")).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Show 3 flags" }));
    expect(onApply).toHaveBeenCalledWith(["phone", "face"]);
  });

  it("clears every option", async () => {
    render(<Filter onApply={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Flag type" }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));
    expect(screen.getByText("Show 0 flags")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Phone in frame" }).getAttribute("aria-checked")).toBe(
      "false",
    );
  });
});

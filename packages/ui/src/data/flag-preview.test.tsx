import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FlagPreview } from "./flag-preview.tsx";
import { RowSession } from "./row-session.tsx";
import { Table } from "./table.tsx";

// Sample strings are the Figma defaults of Popover/Flag preview 71:2212 (3.2b).
function Preview({ onOpenChange = vi.fn() }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <FlagPreview
      onOpenChange={onOpenChange}
      trigger={<a href="/review/1">Phone in frame · 0.94</a>}
      image={<img src="https://example.test/still.jpg" alt="Frame at 10:47:10" />}
      chipLabel="phone 0.94"
      time="10:47:10"
      title="Madina T. · phone in frame"
      detail="Held 6 s. Put away after the warning."
      link={<a href="/review/1">Open review</a>}
    />
  );
}

describe("FlagPreview", () => {
  it("opens on keyboard focus of its trigger with the frame, the chip, the time, what happened and the link", async () => {
    const onOpenChange = vi.fn();
    render(<Preview onOpenChange={onOpenChange} />);
    expect(screen.queryByText("Madina T. · phone in frame")).toBeNull();
    await userEvent.tab();
    expect(await screen.findByText("Madina T. · phone in frame")).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByAltText("Frame at 10:47:10")).toBeTruthy();
    expect(screen.getByText("phone 0.94").closest("[data-status]")?.getAttribute("data-status")).toBe("flag");
    expect(screen.getByText("10:47:10")).toBeTruthy();
    expect(screen.getByText("Held 6 s. Put away after the warning.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open review" })).toBeTruthy();
  });
});

describe("RowSession renderFlags", () => {
  it("wraps the flag count and the top flag, for the 3.2b trigger", () => {
    render(
      <Table>
        <tbody>
          <RowSession
            initials="MT"
            name="Madina Tulegenova"
            studentId="20231187"
            flagCount="3"
            topFlag="Phone in frame · 0.94"
            duration="87 min"
            status="warn"
            statusLabel="Needs review"
            renderFlags={(flags) => <a href="/review/1">{flags}</a>}
          />
        </tbody>
      </Table>,
    );
    const link = screen.getByRole("link");
    expect(within(link).getByText("3")).toBeTruthy();
    expect(within(link).getByText("Phone in frame · 0.94")).toBeTruthy();
  });
});

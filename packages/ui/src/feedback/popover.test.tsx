import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Popover, PopoverInfo, PopoverTrigger } from "./popover.tsx";

// Sample strings are the Figma defaults of Popover/Info 76:2333 (0.1b).
function WhyZero() {
  return (
    <Popover>
      <PopoverTrigger>Video uploaded</PopoverTrigger>
      <PopoverInfo
        title="Why 0 MB?"
        body="Üki checks video on each laptop. Only events and flagged frames reach the server."
        rows={[
          { id: "video", label: "Video", value: "0 MB" },
          { id: "frames", label: "Flagged frames", value: "38 · 2.6 MB" },
          { id: "events", label: "Events", value: "9,870 · 0.7 MB" },
        ]}
        footer={<a href="/privacy-centre">Open privacy centre</a>}
      />
    </Popover>
  );
}

describe("PopoverInfo", () => {
  it("opens from its trigger with Üki's face, the title, two lines and the key values", async () => {
    render(<WhyZero />);
    expect(screen.queryByText("Why 0 MB?")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Video uploaded" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Why 0 MB?");
    expect(dialog.querySelector("img")).not.toBeNull();
    const terms = [...dialog.querySelectorAll("dt")].map((term) => term.textContent);
    const values = [...dialog.querySelectorAll("dd")].map((value) => value.textContent);
    expect(terms).toEqual(["Video", "Flagged frames", "Events"]);
    expect(values).toEqual(["0 MB", "38 · 2.6 MB", "9,870 · 0.7 MB"]);
    expect(screen.getByRole("link", { name: "Open privacy centre" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

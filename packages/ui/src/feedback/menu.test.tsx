import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu, MenuTrigger } from "./menu.ts";
import { MenuContent } from "./menu-content.tsx";
import { MenuItem } from "./menu-item.tsx";
import { MenuLabel } from "./menu-label.tsx";
import { MenuSeparator } from "./menu-separator.tsx";

function TileActions({
  onTimeline,
  onEnd,
  onLanguage,
}: {
  onTimeline?: () => void;
  onEnd?: () => void;
  onLanguage?: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button">Actions</button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>MADINA T. · SEAT 23</MenuLabel>
        <MenuItem icon="history" meta="T" onSelect={onTimeline}>
          Open timeline
        </MenuItem>
        <MenuItem icon="globe" selected onSelect={onLanguage}>
          Қазақша
        </MenuItem>
        <MenuItem icon="globe" selected={false}>
          Русский
        </MenuItem>
        <MenuItem icon="lock" disabled>
          Lock
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="stop" tone="danger" onSelect={onEnd}>
          End session
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

describe("Menu", () => {
  it("opens from the keyboard and lists its items, label and separator", async () => {
    const user = userEvent.setup();
    render(<TileActions />);
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(screen.getByText("MADINA T. · SEAT 23").className).toContain("type-mono-tag");
    expect(screen.getByRole("menuitem", { name: /Open timeline/ })).toBeTruthy();
    expect(screen.getByRole("separator")).toBeTruthy();
    expect(menu.className).toContain("shadow-float");
  });

  it("selects an item with the arrow keys and Enter, then closes", async () => {
    const user = userEvent.setup();
    const onTimeline = vi.fn();
    render(<TileActions onTimeline={onTimeline} />);
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    const timeline = screen.getByRole("menuitem", { name: /Open timeline/ });
    // Opening from the keyboard highlights the first item.
    await waitFor(() => expect(timeline.hasAttribute("data-highlighted")).toBe(true));
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("menuitemcheckbox", { name: /Қазақша/ }).hasAttribute("data-highlighted")).toBe(
        true,
      ),
    );
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(timeline.hasAttribute("data-highlighted")).toBe(true));
    await user.keyboard("{Enter}");
    expect(onTimeline).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("marks the current choice as a checked menuitemcheckbox with the check icon", async () => {
    const user = userEvent.setup();
    render(<TileActions />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const chosen = await screen.findByRole("menuitemcheckbox", { name: /Қазақша/ });
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    expect(chosen.querySelector("[data-icon=check]")).not.toBeNull();
    const other = screen.getByRole("menuitemcheckbox", { name: /Русский/ });
    expect(other.getAttribute("aria-checked")).toBe("false");
    expect(other.querySelector("[data-icon=check]")).toBeNull();
  });

  it("draws Danger in status/flag and ignores disabled items", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();
    render(<TileActions onEnd={onEnd} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const end = await screen.findByRole("menuitem", { name: /End session/ });
    expect(end.className).toContain("text-flag");
    const lock = screen.getByRole("menuitem", { name: /Lock/ });
    expect(lock.getAttribute("aria-disabled")).toBe("true");
    await user.click(end);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});

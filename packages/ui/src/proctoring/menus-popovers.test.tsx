import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findShortcut, type MenuAction } from "./action-menu.tsx";
import { ExtendTimePanel } from "./extend-time-panel.tsx";
import { ExtendTimePopover } from "./extend-time-popover.tsx";
import { QuickMessageMenu } from "./quick-message-menu.tsx";
import { StudentPopover } from "./student-popover.tsx";
import { StudentPopoverCard, type StudentPopoverCardProps } from "./student-popover-card.tsx";
import { StudentTile } from "./student-tile.tsx";
import { TileActionsMenu } from "./tile-actions-menu.tsx";

function actions() {
  const timeline = vi.fn();
  const message = vi.fn();
  const pause = vi.fn();
  const end = vi.fn();
  const groups: MenuAction[][] = [
    [
      { id: "timeline", icon: "history", label: "Open timeline", shortcut: "T", onSelect: timeline },
      { id: "message", icon: "message", label: "Message", shortcut: "M", onSelect: message },
    ],
    [{ id: "pause", icon: "pause", label: "Pause exam", shortcut: "P", onSelect: pause, disabled: true }],
    [{ id: "end", icon: "stop", label: "End session", tone: "danger", onSelect: end }],
  ];
  return { groups, timeline, message, pause, end };
}

function openWithKeyboard(trigger: HTMLElement) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("findShortcut", () => {
  const { groups } = actions();
  it("matches plain keys case-insensitively and skips disabled actions", () => {
    expect(findShortcut(groups, { key: "t", altKey: false, ctrlKey: false, metaKey: false })?.id).toBe(
      "timeline",
    );
    expect(findShortcut(groups, { key: "M", altKey: false, ctrlKey: false, metaKey: false })?.id).toBe(
      "message",
    );
    expect(findShortcut(groups, { key: "p", altKey: false, ctrlKey: false, metaKey: false })).toBeUndefined();
  });
  it("ignores modified keys and named keys", () => {
    expect(findShortcut(groups, { key: "t", altKey: false, ctrlKey: true, metaKey: false })).toBeUndefined();
    expect(
      findShortcut(groups, { key: "Enter", altKey: false, ctrlKey: false, metaKey: false }),
    ).toBeUndefined();
  });
});

describe("TileActionsMenu", () => {
  it("opens from the tile by keyboard and lists the actions with their shortcuts", () => {
    const { groups } = actions();
    render(
      <TileActionsMenu
        header="MADINA T. · 20231187"
        groups={groups}
        trigger={<StudentTile state="flag" name="Madina T." detail="phone 0.94 · 10:47" />}
      />,
    );
    const tile = screen.getByRole("button", { name: /Madina T\./ });
    expect(tile.getAttribute("aria-haspopup")).toBe("menu");
    openWithKeyboard(tile);
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("w-65");
    expect(screen.getByText("MADINA T. · 20231187")).toBeTruthy();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Open timelineT",
      "MessageM",
      "Pause examP",
      "End session",
    ]);
    expect(items[0]?.getAttribute("aria-keyshortcuts")).toBe("T");
    expect(items[2]?.getAttribute("aria-disabled")).toBe("true");
    expect(items[3]?.className).toContain("text-flag");
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("runs an action from its one-key shortcut and closes", () => {
    const { groups, message } = actions();
    const onOpenChange = vi.fn();
    render(
      <TileActionsMenu
        groups={groups}
        onOpenChange={onOpenChange}
        trigger={<StudentTile name="Madina T." detail="x" />}
      />,
    );
    openWithKeyboard(screen.getByRole("button"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "m" });
    expect(message).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ignores the shortcut of a disabled action and selects by click", () => {
    const { groups, pause, end } = actions();
    render(<TileActionsMenu groups={groups} defaultOpen trigger={<button type="button">More</button>} />);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "p" });
    expect(pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "End session" }));
    expect(end).toHaveBeenCalledOnce();
  });
});

describe("QuickMessageMenu", () => {
  it("shows the note under the presets", () => {
    const { groups } = actions();
    render(
      <QuickMessageMenu
        defaultOpen
        groups={groups}
        note="Each student reads it in their language."
        trigger={<button type="button">Message group</button>}
      />,
    );
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("w-70");
    expect(menu.textContent).toContain("Each student reads it in their language.");
  });
});

const panel = {
  title: "Extend time",
  audienceLabel: "WHO",
  audienceOptions: [
    { value: "all", label: "Everyone · 125" },
    { value: "one", label: "Madina T." },
  ],
  audience: "all",
  minutesLabel: "ADD",
  minuteOptions: [
    { value: "5", label: "+5 min" },
    { value: "10", label: "+10 min" },
    { value: "15", label: "+15 min" },
  ],
  minutes: "10",
  note: "Ends at 11:40 instead of 11:30.",
  submitLabel: "Add 10 minutes",
};

describe("ExtendTimePanel", () => {
  it("names both choices by their overlines and reports changes", () => {
    const onMinutesChange = vi.fn();
    const onAudienceChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ExtendTimePanel
        {...panel}
        onMinutesChange={onMinutesChange}
        onAudienceChange={onAudienceChange}
        onSubmit={onSubmit}
      />,
    );
    const add = screen.getByRole("radiogroup", { name: "ADD" });
    expect(screen.getByRole("radiogroup", { name: "WHO" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "+10 min" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "+15 min" }));
    expect(onMinutesChange).toHaveBeenCalledWith("15");
    fireEvent.click(screen.getByRole("radio", { name: "Madina T." }));
    expect(onAudienceChange).toHaveBeenCalledWith("one");
    fireEvent.click(screen.getByRole("button", { name: "Add 10 minutes" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(add).toBeTruthy();
  });

  it("hides WHO without options and blocks submit while sending", () => {
    const onSubmit = vi.fn();
    render(
      <ExtendTimePanel
        {...panel}
        audienceOptions={undefined}
        onMinutesChange={() => undefined}
        onSubmit={onSubmit}
        submitting
      />,
    );
    expect(screen.queryByRole("radiogroup", { name: "WHO" })).toBeNull();
    const button = screen.getByRole("button", { name: "Add 10 minutes" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ExtendTimePopover", () => {
  it("opens from its trigger and closes on Escape", () => {
    render(
      <ExtendTimePopover
        {...panel}
        onMinutesChange={() => undefined}
        onSubmit={() => undefined}
        trigger={<button type="button">Extend time</button>}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Extend time" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

const card: StudentPopoverCardProps = {
  initials: "DK",
  name: "Dias Kenzhebekov",
  meta: "20231044 · Group 204",
  status: { status: "warn", label: "help" },
  step: "Check-in · step 2 of 4",
  stepMeta: "retry 2 of 3",
  steps: [
    { id: "system", label: "SYSTEM", state: "done" },
    { id: "identity", label: "IDENTITY", state: "warn" },
    { id: "rules", label: "RULES", state: "todo" },
    { id: "ready", label: "READY", state: "todo" },
  ],
  facts: [{ id: "problem", label: "Problem", value: "Card unreadable" }],
};

describe("StudentPopoverCard", () => {
  it("shows who, the check-in bar, the facts and both actions", () => {
    const onMessage = vi.fn();
    const onVerify = vi.fn();
    const { container } = render(
      <StudentPopoverCard
        {...card}
        secondaryAction={{ label: "Message", onClick: onMessage }}
        primaryAction={{ label: "Verify by hand", onClick: onVerify }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Dias Kenzhebekov" })).toBeTruthy();
    expect(screen.getByRole("term").textContent).toBe("Problem");
    expect(screen.getByRole("definition").textContent).toBe("Card unreadable");
    const bar = [...container.querySelectorAll("[data-step-state]")].map((el) =>
      el.getAttribute("data-step-state"),
    );
    expect(bar).toEqual(["done", "warn", "todo", "todo"]);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "SYSTEM",
      "IDENTITY",
      "RULES",
      "READY",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify by hand" }));
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onVerify).toHaveBeenCalledOnce();
  });

  it("leaves out the action row without actions", () => {
    render(<StudentPopoverCard {...card} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("StudentPopover", () => {
  it("opens on Enter from the tile", () => {
    render(<StudentPopover {...card} trigger={<StudentTile name="Dias K." detail="Needs help" />} />);
    const tile = screen.getByRole("button", { name: /Dias K\./ });
    fireEvent.click(tile);
    expect(screen.getByRole("dialog").textContent).toContain("Dias Kenzhebekov");
  });
});

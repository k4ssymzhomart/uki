import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "../src/icon.tsx";
import { glyphs, iconNames, icons } from "../src/icons.ts";

// The 93 names on the Figma Icons page (1:63), in page order.
const FIGMA_ICON_NAMES = [
  "gaze",
  "gaze-away",
  "eyes",
  "camera",
  "face-scan",
  "id-card",
  "phone",
  "phone-off",
  "browser-lock",
  "tab-switch",
  "lock",
  "shield",
  "exam",
  "timer",
  "report",
  "flag",
  "alert",
  "check",
  "pause",
  "offline",
  "mic",
  "screen",
  "user",
  "users",
  "settings",
  "layout-grid",
  "calendar",
  "upload",
  "download",
  "search",
  "filter",
  "bell",
  "log-out",
  "plus",
  "more",
  "chevron-right",
  "chevron-down",
  "arrow-right",
  "external-link",
  "eye-off",
  "play",
  "stop",
  "refresh",
  "copy",
  "globe",
  "chip",
  "message",
  "edit",
  "history",
  "info",
  "help",
  "puzzle",
  "link",
  "key",
  "unlock",
  "clipboard",
  "printer",
  "keyboard",
  "app-window",
  "wifi",
  "hand",
  "code",
  "bar-chart",
  "trend-up",
  "pie-chart",
  "database",
  "archive",
  "trash",
  "file-text",
  "building",
  "sliders",
  "list-check",
  "user-plus",
  "mail",
  "moon",
  "sun",
  "plug",
  "shield-check",
  "graduation-cap",
  "cloud-off",
  "laptop",
  "chevron-left",
  "chevron-up",
  "close",
  "calculator",
  "arrow-up",
  "arrow-down",
  "sort",
  "send",
  "minus",
  "square",
  "inbox",
  "menu",
];

describe("icons map", () => {
  it("maps exactly the 93 Figma icon names, in page order", () => {
    expect(FIGMA_ICON_NAMES).toHaveLength(93);
    expect(iconNames).toEqual(FIGMA_ICON_NAMES);
  });

  it("maps every name to a Lucide component that renders an svg", () => {
    for (const name of iconNames) {
      const Glyph = icons[name];
      expect(Glyph, name).toBeDefined();
      const { container, unmount } = render(<Glyph />);
      expect(container.querySelector("svg"), name).not.toBeNull();
      unmount();
    }
  });

  it("has the checkbox tick glyph", () => {
    const { container } = render(<glyphs.tick />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("Icon", () => {
  it("renders 24 px with a 2 px stroke and is hidden from assistive technology by default", () => {
    const { container } = render(<Icon name="gaze" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-icon")).toBe("gaze");
    expect(svg?.getAttribute("class")).toContain("text-icon-primary");
  });

  it("is an image with a name when labelled", () => {
    render(<Icon name="offline" label="Offline" />);
    const img = screen.getByRole("img", { name: "Offline" });
    expect(img.getAttribute("aria-hidden")).toBeNull();
  });

  it("lets a class override the colour", () => {
    const { container } = render(<Icon name="flag" className="size-4 text-flag" />);
    const classes = container.querySelector("svg")?.getAttribute("class") ?? "";
    expect(classes).toContain("text-flag");
    expect(classes).not.toContain("text-icon-primary");
  });
});

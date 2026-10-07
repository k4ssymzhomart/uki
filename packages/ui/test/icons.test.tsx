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
    const { container } = render(<Icon name="camera" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-icon")).toBe("camera");
    expect(svg?.getAttribute("class")).toContain("text-icon-primary");
  });

  it.each([
    ["square", 14 / 18],
    ["stop", 12 / 18],
    ["gaze", 8.5 / 10],
  ] as const)(
    "draws %s smaller in its 24 px box, as Figma does, with the same 2 px stroke",
    (name, scale) => {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      const [x, y, width, height] = (svg?.getAttribute("viewBox") ?? "").split(" ").map(Number);
      expect(width).toBeCloseTo(24 / scale);
      expect(height).toBeCloseTo(24 / scale);
      expect(x).toBeCloseTo((24 - 24 / scale) / 2);
      expect(y).toBeCloseTo((24 - 24 / scale) / 2);
      // Rendered stroke = attribute × 24 / viewBox width = 2 px.
      expect(Number(svg?.getAttribute("stroke-width")) * (24 / (width ?? 1))).toBeCloseTo(2);
      expect(svg?.getAttribute("width")).toBe("24");
      expect(svg?.getAttribute("data-icon")).toBe(name);
    },
  );

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

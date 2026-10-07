import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { faceSrc } from "../art/faces.ts";
import { CameraTile } from "./camera-tile.tsx";
import { Hud } from "./hud.tsx";
import { LiveWidget } from "./live-widget.tsx";
import { StudentTile } from "./student-tile.tsx";
import { Timer } from "./timer.tsx";

afterEach(cleanup);

describe("StudentTile", () => {
  it("is a button with the name, detail and state text", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <StudentTile
        state="flag"
        name="Madina T."
        detail="phone 0.94 · 10:47"
        stateLabel="Flagged"
        onClick={onClick}
      />,
    );
    const tile = getByRole("button", { name: /Madina T\..*phone 0\.94 · 10:47.*Flagged/ });
    expect(tile.getAttribute("type")).toBe("button");
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([
    ["ok", "neutral", "ok"],
    ["warn", "alert", "warn"],
    ["flag", "flag", "flag"],
    ["paused", "sleeping", "idle"],
  ] as const)("state %s shows the %s face and the %s dot", (state, face, tone) => {
    const { container } = render(<StudentTile state={state} name="A" detail="B" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(faceSrc(face));
    expect(container.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe(tone);
  });

  it("draws the flag ring only when flagged", () => {
    const { getByRole, rerender } = render(<StudentTile state="flag" name="A" detail="B" />);
    expect(getByRole("button").className).toContain("inset-ring-flag");
    rerender(<StudentTile state="warn" name="A" detail="B" />);
    expect(getByRole("button").className).not.toContain("inset-ring-flag");
  });

  it("does not fire when disabled", () => {
    const onClick = vi.fn();
    const { getByRole } = render(<StudentTile name="A" detail="B" disabled onClick={onClick} />);
    fireEvent.click(getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Timer", () => {
  it("exposes the bar as a progressbar and clamps the value", () => {
    const { getByRole, rerender } = render(
      <Timer time="42:17" label="left" progress={0.7} progressLabel="Time used" />,
    );
    const bar = getByRole("progressbar", { name: "Time used" });
    expect(bar.getAttribute("aria-valuenow")).toBe("70");
    rerender(<Timer time="0:00" label="left" progress={1.4} progressLabel="Time used" />);
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    rerender(<Timer time="0:00" label="left" progress={Number.NaN} progressLabel="Time used" />);
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });
});

describe("LiveWidget", () => {
  it.each([
    ["watching", "neutral", "ok"],
    ["looked-away", "alert", "warn"],
    ["phone", "flag", "flag"],
    ["paused", "sleeping", "idle"],
    ["submitted", "happy", "ok"],
  ] as const)("%s shows the %s face and the %s dot", (state, face, tone) => {
    const { container, getByText } = render(<LiveWidget state={state} title="Title" detail="detail" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(faceSrc(face));
    expect(container.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe(tone);
    expect(getByText("Title").getAttribute("aria-live")).toBe("polite");
  });
});

describe("Hud", () => {
  it.each([
    ["gaze", "alert"],
    ["phone", "flag"],
    ["tab", "thinking"],
  ] as const)("%s shows the %s face", (kind, face) => {
    const { container } = render(<Hud kind={kind} message="m" meta="2 s" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(faceSrc(face));
  });

  it("is a dark polite status that hides when not visible", () => {
    const { getByRole, queryByRole, rerender } = render(<Hud message="Eyes on the screen" meta="2 s" />);
    const hud = getByRole("status");
    expect(hud.getAttribute("data-theme")).toBe("dark");
    expect(hud.textContent).toBe("Eyes on the screen2 s");
    rerender(<Hud message="Eyes on the screen" visible={false} />);
    expect(queryByRole("status")).toBeNull();
    expect(hud.className).toContain("opacity-0");
  });
});

describe("CameraTile", () => {
  it("renders the preview, both pills and the face frame, always dark", () => {
    const { container, getByText } = render(
      <CameraTile liveLabel="LIVE · LOCAL" facesLabel="1 face" aria-label="Camera">
        <canvas data-testid="v" />
      </CameraTile>,
    );
    const root = container.firstElementChild;
    expect(root?.getAttribute("data-theme")).toBe("dark");
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(getByText("LIVE · LOCAL")).toBeTruthy();
    expect(getByText("1 face")).toBeTruthy();
    expect(container.querySelector("img[aria-hidden='true']")?.getAttribute("src")).toMatch(/svg/);
  });

  it("hides the faces pill and the frame on request", () => {
    const { container, queryByText } = render(<CameraTile liveLabel="LIVE" showFaceFrame={false} />);
    expect(queryByText("1 face")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});

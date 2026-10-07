import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCK_BAR_HEIGHT, LockBar } from "./lock-bar.tsx";
import { LockCheck } from "./lock-check.tsx";
import { LockPopup } from "./lock-popup.tsx";
import { LockToast } from "./lock-toast.tsx";
import { LockToolbarIcon } from "./lock-toolbar-icon.tsx";

afterEach(cleanup);

describe("LockCheck", () => {
  it.each([
    ["pass", "bg-ok-subtle"],
    ["wait", "bg-warn-subtle"],
    ["fail", "bg-flag-subtle"],
  ] as const)("%s uses the %s mark", (status, mark) => {
    const { container } = render(<LockCheck status={status} title="Other tabs" detail="3 open." />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.status).toBe(status);
    expect(root.querySelector(`.${mark}`)).not.toBeNull();
    expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reads the status label before the title", () => {
    const { getByText } = render(<LockCheck status="wait" title="Other tabs" statusLabel="Waiting" />);
    expect(getByText("Other tabs").textContent).toBe("Waiting Other tabs");
  });
});

describe("LockToast", () => {
  it("is a polite status with message and time", () => {
    const { getByRole } = render(<LockToast message="Copy is off during the exam." time="14:16 · noted" />);
    const toast = getByRole("status");
    expect(toast.textContent).toBe("Copy is off during the exam.14:16 · noted");
  });
});

describe("LockToolbarIcon", () => {
  it("is decorative without a label and an image with one", () => {
    const { container, rerender, getByRole } = render(<LockToolbarIcon state="off" />);
    expect((container.firstElementChild as HTMLElement).getAttribute("aria-hidden")).toBe("true");
    rerender(<LockToolbarIcon state="locked" label="Üki Lock · locked" />);
    expect(getByRole("img", { name: "Üki Lock · locked" })).toBeTruthy();
  });

  it("dims the face when off, adds the lime dot when ready and the lock badge when locked", () => {
    const { container, rerender } = render(<LockToolbarIcon state="off" />);
    expect(container.querySelector("img")?.className).toContain("opacity-45");
    rerender(<LockToolbarIcon state="ready" />);
    expect(container.querySelector(".bg-brand")).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    rerender(<LockToolbarIcon state="locked" />);
    expect(container.querySelector(".bg-inverse svg")).not.toBeNull();
  });
});

describe("LockPopup", () => {
  it("frames the body with header and footer", () => {
    const { getByRole, getByText } = render(
      <LockPopup headerTitle="Üki Lock" badge="READY" footer="Üki app · connected">
        <p>Body</p>
      </LockPopup>,
    );
    expect(getByRole("heading", { level: 1, name: "Üki Lock" })).toBeTruthy();
    expect(getByText("READY").dataset.tone).toBe("brand");
    expect(getByRole("status").textContent).toBe("Üki app · connected");
    expect(getByText("Body")).toBeTruthy();
  });

  it("drops the card frame inside the real popup", () => {
    const { container } = render(
      <LockPopup headerTitle="Üki Lock" badge="LOCKED" badgeTone="ink" footer="x" framed={false}>
        <p>Body</p>
      </LockPopup>,
    );
    expect((container.firstElementChild as HTMLElement).className).not.toContain("shadow-float");
  });
});

describe("LockBar", () => {
  const base = {
    badge: "LOCKED",
    exam: "Physics 1 · Quiz 3",
    watching: "Üki watching",
    time: "17:42",
    timeLabel: "left",
  };

  it("is dark, marks the active tab and fires tab selection", () => {
    const onSelect = vi.fn();
    const { container, getByRole } = render(
      <LockBar
        {...base}
        tabs={[
          { id: "portal", icon: "globe", label: "Exam portal", active: true },
          { id: "calc", icon: "calculator", label: "Calculator", onSelect },
        ]}
      />,
    );
    expect((container.firstElementChild as HTMLElement).dataset.theme).toBe("dark");
    expect(getByRole("button", { name: "Exam portal" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(getByRole("button", { name: "Calculator" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("hides Ask proctor until both label and handler are given", () => {
    const tabs = [{ id: "portal", icon: "globe", label: "Exam portal", active: true }] as const;
    const { container, rerender, getByRole } = render(
      <LockBar {...base} tabs={tabs} askProctorLabel="Ask proctor" />,
    );
    expect(within(container).queryByRole("button", { name: "Ask proctor" })).toBeNull();
    const onAsk = vi.fn();
    rerender(<LockBar {...base} tabs={tabs} askProctorLabel="Ask proctor" onAskProctor={onAsk} />);
    fireEvent.click(getByRole("button", { name: "Ask proctor" }));
    expect(onAsk).toHaveBeenCalledOnce();
  });

  it("keeps the Figma height", () => {
    expect(LOCK_BAR_HEIGHT).toBe(52);
  });
});

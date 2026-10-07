import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LockPopupLocked } from "./lock-popup-locked.tsx";
import { LockPopupPair } from "./lock-popup-pair.tsx";
import { LockPopupReady } from "./lock-popup-ready.tsx";
import { LockPopupReleased } from "./lock-popup-released.tsx";

const frame = { headerTitle: "Üki Lock", footer: "Üki app · connected" } as const;

describe("LockPopupPair", () => {
  it("shows the code as named output and pairs on click", () => {
    const onPair = vi.fn();
    render(
      <LockPopupPair
        {...frame}
        badge="NOT PAIRED"
        title="Pair with the Üki app"
        body="Both should show the same code."
        code="482 913"
        codeLabel="Pairing code"
        check={{ id: "app", status: "pass", title: "Üki app found", detail: "Windows 11 · Aliya S." }}
        action={{ label: "Pair", onClick: onPair }}
        hint="Different code? Close this and restart the Üki app."
      />,
    );
    expect(screen.getByText("NOT PAIRED").dataset.tone).toBe("neutral");
    expect(screen.getByRole("heading", { level: 2, name: "Pair with the Üki app" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Pairing code" }).textContent).toBe("482 913");
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));
    expect(onPair).toHaveBeenCalledOnce();
  });

  it("waits for the app without code, check or button", () => {
    render(
      <LockPopupPair {...frame} badge="NOT PAIRED" title="Open the Üki app" body="It pairs on its own." />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("status", { name: "Pairing code" })).toBeNull();
  });
});

describe("LockPopupReady", () => {
  it("lists the checks and locks on click; the button can show loading", () => {
    const onLock = vi.fn();
    const { container, rerender } = render(
      <LockPopupReady
        {...frame}
        badge="READY"
        overline="NEXT EXAM"
        exam="Physics 1 · Quiz 3"
        examMeta="Starts 14:00 · 40 min · exam.kru.test"
        checks={[
          { id: "app", status: "pass", title: "Üki app", detail: "Connected · camera on" },
          { id: "tabs", status: "wait", title: "Other tabs", detail: "3 open." },
        ]}
        action={{ label: "Lock and start", onClick: onLock }}
        note="Only the exam portal stays open."
      />,
    );
    expect(screen.getByText("READY").dataset.tone).toBe("brand");
    expect(
      [...container.querySelectorAll("[data-status]")].map((el) => el.getAttribute("data-status")),
    ).toEqual(["pass", "wait"]);
    fireEvent.click(screen.getByRole("button", { name: "Lock and start" }));
    expect(onLock).toHaveBeenCalledOnce();
    rerender(
      <LockPopupReady
        {...frame}
        badge="READY"
        overline="NEXT EXAM"
        exam="Physics 1 · Quiz 3"
        checks={[]}
        action={{ label: "Lock and start", onClick: onLock, loading: true }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lock and start" }));
    expect(onLock).toHaveBeenCalledOnce();
  });
});

describe("LockPopupLocked", () => {
  it("shows time, progress, allowed sites and noted events", () => {
    render(
      <LockPopupLocked
        {...frame}
        badge="LOCKED"
        time="17:42"
        timeMeta="left · ends 14:40"
        progress={0.55}
        progressLabel="Time used"
        allowedLabel="OPEN DURING THE EXAM"
        allowed={[{ id: "portal", icon: "globe", label: "Exam portal", meta: "exam.kru.test" }]}
        notedLabel="NOTED · 1"
        noted={[{ id: "1", time: "14:09:31", title: "New tab blocked", detail: "Ctrl+T pressed" }]}
      />,
    );
    expect(screen.getByText("LOCKED").dataset.tone).toBe("ink");
    expect(screen.getByRole("progressbar", { name: "Time used" }).getAttribute("aria-valuenow")).toBe("55");
    expect(screen.getByRole("heading", { name: "OPEN DURING THE EXAM" })).toBeTruthy();
    expect(screen.getByRole("listitem").textContent).toBe("Exam portalexam.kru.test");
    expect(screen.getByText("New tab blocked")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("LockPopupReleased", () => {
  it("shows the facts and closes", () => {
    const onClose = vi.fn();
    render(
      <LockPopupReleased
        {...frame}
        badge="DONE"
        title="Lock released"
        body="Submitted at 14:38. Your 3 tabs are back."
        facts={[{ id: "for", label: "Locked for", value: "38 min" }]}
        action={{ label: "Close", onClick: onClose }}
      />,
    );
    expect(screen.getByText("DONE").dataset.tone).toBe("ok");
    expect(screen.getByRole("term").textContent).toBe("Locked for");
    expect(screen.getByRole("definition").textContent).toBe("38 min");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

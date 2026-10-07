import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../controls/button.tsx";
import { Banner } from "./banner.tsx";
import { Dialog } from "./dialog.tsx";
import { Spinner } from "./spinner.tsx";
import { Toast } from "./toast.tsx";
import { type ToastApi, useToast } from "./toast-context.ts";
import { ToastProvider } from "./toast-provider.tsx";
import { Tooltip } from "./tooltip.tsx";

describe("Dialog", () => {
  function SendReport({ onConfirm, tone }: { onConfirm?: () => void; tone?: "default" | "danger" }) {
    return (
      <Dialog
        trigger={<Button>Send</Button>}
        tone={tone}
        title="Send the report?"
        body="The committee gets a read-only link that expires in 7 days."
        cancelLabel="Cancel"
        confirmLabel="Send link"
        onConfirm={onConfirm}
      />
    );
  }

  it("opens from its trigger as a named, described modal dialog and focuses inside it", async () => {
    const user = userEvent.setup();
    render(<SendReport />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    const dialog = screen.getByRole("dialog", { name: "Send the report?" });
    expect(dialog.getAttribute("aria-describedby")).toBe(
      screen.getByText("The committee gets a read-only link that expires in 7 days.").id,
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog.dataset.tone).toBe("default");
  });

  it("closes with Escape and with Cancel, and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<SendReport />);
    const trigger = screen.getByRole("button", { name: "Send" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onConfirm from the confirm button and keeps focus trapped with Tab", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<SendReport onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    const dialog = screen.getByRole("dialog");
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Send link" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("uses the danger style and the alert icon for Tone=Danger", async () => {
    const user = userEvent.setup();
    render(<SendReport tone="danger" />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("[data-icon=alert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send link" }).dataset.variant).toBe("danger");
  });

  it("draws a 40 % bg-inverse scrim in every theme: a paper wash on the dark wall (2.4e)", () => {
    render(<Dialog open title="End the session?" cancelLabel="Cancel" confirmLabel="End session" />);
    const scrim = [...document.body.querySelectorAll<HTMLElement>("[data-state=open]")].find(
      (element) => element.getAttribute("role") !== "dialog" && element.className.includes("inset-0"),
    );
    expect(scrim?.className).toContain("bg-inverse/40");
    expect(scrim?.className).not.toContain("dark:");
  });

  it("disables and loads the confirm button, and renders a field", () => {
    render(
      <Dialog
        open
        tone="danger"
        title="End the session?"
        cancelLabel="Cancel"
        confirmLabel="End session"
        confirmLoading
      >
        <label>
          Reason
          <input />
        </label>
      </Dialog>,
    );
    const confirm = screen.getByRole("button", { name: "End session" });
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Reason" })).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeNull();
  });
});

describe("Toast", () => {
  function Harness({ onApi }: { onApi: (api: ToastApi) => void }) {
    onApi(useToast());
    return null;
  }

  it("shows a toast through useToast with its message, action and close button", async () => {
    const user = userEvent.setup();
    let api: ToastApi | undefined;
    const onAction = vi.fn();
    render(
      <ToastProvider label="Notifications" closeLabel="Close">
        <Harness
          onApi={(value) => {
            api = value;
          }}
        />
      </ToastProvider>,
    );
    act(() => {
      api?.show({ kind: "success", message: "Report sent to the committee.", action: "Undo", onAction });
    });
    const toast = await screen.findByText("Report sent to the committee.");
    const root = toast.closest("li");
    expect(root?.getAttribute("data-theme")).toBe("dark");
    expect(root?.dataset.kind).toBe("success");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    let api: ToastApi | undefined;
    render(
      <ToastProvider label="Notifications" closeLabel="Close">
        <Harness
          onApi={(value) => {
            api = value;
          }}
        />
      </ToastProvider>,
    );
    act(() => {
      api?.show({ kind: "error", message: "Could not send the report." });
    });
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Could not send the report.")).toBeNull());
  });

  it("replaces a toast that reuses an id, as a Progress toast becomes Success", async () => {
    let api: ToastApi | undefined;
    const { container } = render(
      <ToastProvider label="Notifications" closeLabel="Close">
        <Harness
          onApi={(value) => {
            api = value;
          }}
        />
      </ToastProvider>,
    );
    let id = "";
    act(() => {
      id = api?.show({ kind: "progress", message: "Sending the report…" }) ?? "";
    });
    expect(container.ownerDocument.querySelector("[data-slot=spinner]")).not.toBeNull();
    act(() => {
      api?.show({ id, kind: "success", message: "Report sent to the committee." });
    });
    await screen.findByText("Report sent to the committee.");
    expect(screen.queryByText("Sending the report…")).toBeNull();
    expect(document.querySelectorAll("li[data-kind]")).toHaveLength(1);
  });

  it("hides itself after 4 s unless it is an error", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider label="Notifications" closeLabel="Close">
          <Toast kind="info" message="Saved." closeLabel="Close" />
          <Toast kind="error" message="Failed." closeLabel="Close" />
        </ToastProvider>,
      );
      expect(screen.getByText("Saved.")).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(4100);
      });
      expect(screen.queryByText("Saved.")).toBeNull();
      expect(screen.getByText("Failed.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a clear error without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Harness onApi={() => {}} />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe("Banner", () => {
  it.each([
    ["info", "status", "bg-brand-subtle", "info"],
    ["warn", "alert", "bg-warn-subtle", "alert"],
    ["error", "alert", "bg-flag-subtle", "alert"],
    ["offline", "status", "bg-subtle", "cloud-off"],
  ] as const)("draws %s as a %s with its tone and icon", (kind, role, bg, icon) => {
    render(
      <Banner
        kind={kind}
        title="Lobby opens at 09:40"
        body="Students can join 20 minutes before the start."
      />,
    );
    const banner = screen.getByRole(role);
    expect(banner.className).toContain(bg);
    expect(banner.querySelector(`[data-icon=${icon}]`)).not.toBeNull();
    expect(banner.textContent).toContain("Students can join 20 minutes before the start.");
  });

  it("renders an action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Banner title="Lobby opens" action={<Button onClick={onClick}>Open lobby</Button>} />);
    await user.click(screen.getByRole("button", { name: "Open lobby" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Spinner", () => {
  it("is decorative without a label", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces its label as a status", () => {
    render(<Spinner label="Loading" size="sm" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading");
    expect(status.querySelector("svg")?.getAttribute("class")).toContain("size-3.5");
  });
});

describe("Tooltip", () => {
  it("shows its text and shortcut on keyboard focus and hides on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Copy report link" shortcut="⌘ C" delayDuration={0}>
        <button type="button" aria-label="Copy">
          c
        </button>
      </Tooltip>,
    );
    await user.tab();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Copy report link");
    const content = document.querySelector("[data-side]");
    expect(content?.textContent).toContain("⌘ C");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("can be held open", () => {
    function Open() {
      const [open] = useState(true);
      return (
        <Tooltip open={open} content="Copy report link">
          <button type="button">Copy</button>
        </Tooltip>
      );
    }
    render(<Open />);
    expect(screen.getByRole("tooltip").textContent).toContain("Copy report link");
  });
});

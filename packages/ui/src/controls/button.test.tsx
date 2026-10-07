import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.tsx";
import { IconButton } from "./icon-button.tsx";

describe("Button", () => {
  it("is a button of type button that clicks with the mouse and the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start exam</Button>);
    const button = screen.getByRole("button", { name: "Start exam" });
    expect(button.getAttribute("type")).toBe("button");
    await user.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["primary", "bg-inverse"],
    ["brand", "bg-brand"],
    ["secondary", "inset-ring-line-strong"],
    ["ghost", "hover:bg-hover"],
    ["danger", "bg-danger"],
  ] as const)("draws the %s style", (variant, expected) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.className).toContain(expected);
    expect(button.dataset.variant).toBe(variant);
    expect(button.className).toContain("focus-visible:shadow-focus");
  });

  it("does not click when disabled and draws the Disabled style", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="brand" disabled onClick={onClick}>
        Start exam
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Start exam" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.className).toContain("bg-subtle");
    expect(button.className).not.toContain("bg-brand ");
    expect(button.className).not.toContain("hover:");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a spinner, reports busy and ignores clicks while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Start exam
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Start exam" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector("[data-slot=spinner]")).not.toBeNull();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders its child with the button look when asChild", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/report">Open report</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Open report" });
    expect(link.className).toContain("rounded-pill");
    expect(link.className).toContain("inset-ring-line-strong");
  });

  it("lets a className win over the variant", () => {
    render(<Button className="w-full bg-inverse-hover">Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.className).toContain("bg-inverse-hover");
    expect(button.className).toContain("w-full");
  });
});

describe("IconButton", () => {
  it("is named by its label and renders the icon at 20 px", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(<IconButton icon="more" label="More actions" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "More actions" });
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("size-5");
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("more");
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not click when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="close" label="Close" disabled onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

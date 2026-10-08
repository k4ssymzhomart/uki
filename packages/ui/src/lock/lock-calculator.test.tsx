import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockCalculator } from "./lock-calculator.tsx";

afterEach(cleanup);

describe("LockCalculator", () => {
  it("draws E.5b's display, keypad and note", () => {
    const { container } = render(
      <LockCalculator
        expression="2 × 25 ÷ 2"
        value="25"
        clearLabel="C"
        note="Works offline. Keeps no history after you submit."
        onKey={() => {}}
      />,
    );
    const keys = [...container.querySelectorAll<HTMLButtonElement>("[data-uki-calc-key]")];
    expect(keys.map((key) => key.textContent)).toEqual("C ± % ÷ 7 8 9 × 4 5 6 − 1 2 3 + 0 . =".split(" "));
    expect(container.querySelector("[data-uki-calc-expression]")?.textContent).toBe("2 × 25 ÷ 2");
    const value = container.querySelector("[data-uki-calc-value]");
    expect(value?.textContent).toBe("25");
    expect(value?.className).toContain("type-h2");
    expect(screen.getByText("Works offline. Keeps no history after you submit.")).toBeTruthy();
    // Operators ink, = lime, 0 twice as wide.
    expect(container.querySelector('[data-uki-calc-key="/"]')?.className).toContain("bg-inverse");
    expect(container.querySelector('[data-uki-calc-key="="]')?.className).toContain("bg-brand");
    expect(container.querySelector('[data-uki-calc-key="0"]')?.className).toContain("flex-2");
  });

  it("reports each key and steps the value down when it is long or an error", () => {
    const onKey = vi.fn();
    const { container, rerender } = render(
      <LockCalculator expression="" value="0" clearLabel="C" onKey={onKey} />,
    );
    for (const key of ["clear", "sign", "percent", "/", "7", ".", "="]) {
      const button = container.querySelector<HTMLButtonElement>(`[data-uki-calc-key="${key}"]`);
      if (button) fireEvent.click(button);
    }
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(["clear", "sign", "percent", "/", "7", ".", "="]);
    rerender(
      <LockCalculator expression="7 ÷ 0" value="Can't divide by 0" error clearLabel="C" onKey={onKey} />,
    );
    const value = container.querySelector("[data-uki-calc-value]");
    expect(value?.className).toContain("type-h3");
    expect(value?.hasAttribute("data-error")).toBe(true);
    rerender(<LockCalculator expression="" value="123456789012" compact clearLabel="C" onKey={onKey} />);
    expect(container.querySelector("[data-uki-calc-value]")?.className).toContain("type-h3");
  });
});

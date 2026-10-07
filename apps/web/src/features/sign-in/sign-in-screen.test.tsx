import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rawKeys, renderWithIntl } from "../../../test/render.tsx";
import type { SignInState } from "./sign-in-form.ts";
import { SignInScreen } from "./sign-in-screen.tsx";

vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));

describe("A.0 Sign in", () => {
  it("renders every Figma string from dashboard.* keys and hides the Phase 2 parts", () => {
    const { container } = renderWithIntl(<SignInScreen action={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sign in to Üki." })).toBeTruthy();
    expect(screen.getByLabelText("Work email")).toBeTruthy();
    expect(screen.getByLabelText("Password", { selector: "input" })).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Keep me signed in for 12 hours" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText("Every flag gets a human decision")).toBeTruthy();
    expect(screen.queryByText(/Forgot password/)).toBeNull();
    expect(screen.queryByText("ENG")).toBeNull();
    expect(rawKeys(container)).toEqual([]);
  });

  it("shows the action's errors under the fields", async () => {
    const action = vi.fn(
      async (_state: SignInState, _form: FormData): Promise<SignInState> => ({
        email: "dana",
        keep: true,
        errors: { email: "email", password: "credentials" },
      }),
    );
    renderWithIntl(<SignInScreen action={action} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    });
    await waitFor(() => expect(screen.getByText("Enter your work email.")).toBeTruthy());
    expect(screen.getByText("The email or password is wrong.")).toBeTruthy();
    const email = screen.getByLabelText("Work email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(email.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Enter your work email.",
    );
    const form = action.mock.calls[0]?.[1];
    expect(form?.get("keep")).toBe("on");
  });

  it("shows and hides the password", () => {
    renderWithIntl(<SignInScreen action={vi.fn()} />);
    const input = screen.getByLabelText("Password", { selector: "input" });
    expect(input.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.getAttribute("type")).toBe("password");
  });
});

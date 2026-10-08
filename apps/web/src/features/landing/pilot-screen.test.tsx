import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rawKeys, renderWithIntl } from "../../../test/render.tsx";
import type { PilotFormState } from "./pilot-model.ts";
import { PilotScreen } from "./pilot-screen.tsx";

vi.mock("next/image", () => import("../../../test/next-image-mock.tsx"));

const MONTHS = ["2026-11", "2026-12"];

function renderPilot(action: (state: PilotFormState, form: FormData) => Promise<PilotFormState>) {
  return renderWithIntl(
    <PilotScreen
      band={<p>band</p>}
      sentBand={<p>sent band</p>}
      plan={<p>plan</p>}
      months={MONTHS}
      action={action}
    />,
  );
}

describe("/pilot", () => {
  it("draws the request form from dashboard.landing keys, on the frame's defaults", () => {
    const { container } = renderPilot(vi.fn());
    expect(screen.getByRole("heading", { name: "Tell us about your exams" })).toBeTruthy();
    expect(screen.getByLabelText("Full name")).toBeTruthy();
    expect(screen.getByLabelText("Work email")).toBeTruthy();
    expect(screen.getByLabelText("University")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Your role" }).textContent).toContain("Exam office");
    expect(screen.getByRole("combobox", { name: "Students in one exam" }).textContent).toContain("100–300");
    expect(screen.getByRole("combobox", { name: "When" }).textContent).toContain("November 2026");
    expect(screen.getByText("Optional · 0/500")).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", { name: "Send me the Demo Day invite for 16 October." })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(rawKeys(container)).toEqual([]);
  });

  it("counts the message as it is typed", () => {
    renderPilot(vi.fn());
    fireEvent.change(screen.getByLabelText("Anything we should know"), { target: { value: "Four groups." } });
    expect(screen.getByText("Optional · 12/500")).toBeTruthy();
  });

  it("shows the refusal on the form's error line and keeps the values", async () => {
    const action = vi.fn(
      async (_state: PilotFormState, _form: FormData): Promise<PilotFormState> => ({
        status: "rateLimited",
        errors: {},
        values: {
          name: "Dana Akhmetova",
          email: "dana.akhmetova@kru.test",
          university: "KRU · Kostanay",
          role: "exam_office",
          students: "from100",
          when: "2026-11",
          message: "",
          demoDay: true,
        },
      }),
    );
    renderPilot(action);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Book a pilot" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "This email has sent three requests today. Write to us again tomorrow.",
      ),
    );
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Dana Akhmetova");
  });

  it("replaces the form with Sent once the request is stored, from the top of the page", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const action = vi.fn(
      async (): Promise<PilotFormState> => ({
        status: "sent",
        reference: null,
        request: {
          name: "Dana Akhmetova",
          email: "dana.akhmetova@kru.test",
          university: "KRU · Kostanay",
          role: "exam_office",
          students: "from100",
          when: "2026-11",
          message: "",
          demoDay: true,
        },
      }),
    );
    const { container } = renderPilot(action);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Book a pilot" }));
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Request sent." })).toBeTruthy());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Request sent." }));
    expect(
      screen.getByText(
        "We’ll write to dana.akhmetova@kru.test within 2 working days to set up the 30-minute call.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.queryByText("Request")).toBeNull();
    const calendar = screen.getByRole("link", { name: "Add Demo Day to calendar" });
    expect(calendar.getAttribute("download")).toBe("uki-demo-day.ics");
    expect(decodeURIComponent(calendar.getAttribute("href") ?? "")).toContain("DTSTART;VALUE=DATE:20261016");
    expect(screen.getByRole("link", { name: "Back to the site" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText("band")).toBeNull();
    expect(screen.getByText("sent band")).toBeTruthy();
    expect(rawKeys(container)).toEqual([]);
  });
});

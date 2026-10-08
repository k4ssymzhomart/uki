// Book a pilot (194:4014) and Sent (195:4090) in Russian, the only public page with client-side state:
// the form, each field's line, the refusal and failure lines and Sent render from the Russian messages
// with no next-intl error and no raw key. The server-rendered sections of /, /privacy and /terms are
// checked in Russian through the real uki_locale cookie by e2e/landing.spec.ts.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import ru from "@uki/i18n/messages/ru.json";
import { describe, expect, it, vi } from "vitest";
import type { PilotFormState, PilotValues } from "../src/features/landing/pilot-model.ts";
import { PilotScreen } from "../src/features/landing/pilot-screen.tsx";
import { intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/image", () => import("./next-image-mock.tsx"));

type Tree = { [key: string]: string | Tree };

/** The Russian message at a dotted key. */
function t(key: string): string {
  let node: string | Tree | undefined = ru as Tree;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (typeof node !== "string") throw new Error(`no Russian message ${key}`);
  return node;
}

const VALUES: PilotValues = {
  name: "Дана Ахметова",
  email: "dana.akhmetova@kru.test",
  university: "КРУ · Костанай",
  role: "exam_office",
  students: "from100",
  when: "2026-11",
  message: "",
  demoDay: true,
};

function renderPilot(next: PilotFormState) {
  const action = vi.fn(async (): Promise<PilotFormState> => next);
  const view = renderWithIntl(
    <PilotScreen
      band={<p>band</p>}
      sentBand={<p>sent band</p>}
      plan={<p>plan</p>}
      months={["2026-11", "2026-12"]}
      action={action}
    />,
    null,
    "ru",
  );
  return { ...view, action };
}

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: t("dashboard.landing.pilot.form.submit") }));
  });
}

describe("Book a pilot in Russian", () => {
  it("draws the form from the Russian messages", () => {
    const { container } = renderPilot({ status: "editing", values: VALUES, errors: {} });
    expect(screen.getByRole("heading", { name: t("dashboard.landing.pilot.form.title") })).toBeTruthy();
    expect(screen.getByLabelText(t("dashboard.landing.pilot.form.name"))).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: t("dashboard.landing.pilot.form.when") }).textContent,
    ).toContain("2026");
    // The English messages are not what the page shows.
    expect(container.textContent).not.toContain("Tell us about your exams");
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });

  it("shows each field's line, the refusal and the failure in Russian", async () => {
    for (const next of [
      {
        status: "editing",
        values: { ...VALUES, name: "", email: "dana", university: "" },
        errors: { name: "nameRequired", email: "emailInvalid", university: "universityRequired" },
      },
      { status: "rateLimited", values: VALUES, errors: {} },
      { status: "failed", values: VALUES, errors: {} },
    ] satisfies PilotFormState[]) {
      const { container, unmount } = renderPilot(next);
      await submit();
      if (next.status === "editing") {
        await waitFor(() =>
          expect(screen.getByText(t("dashboard.landing.pilot.form.error.nameRequired"))).toBeTruthy(),
        );
        expect(screen.getByText(t("dashboard.landing.pilot.form.error.emailInvalid"))).toBeTruthy();
        expect(screen.getByText(t("dashboard.landing.pilot.form.error.universityRequired"))).toBeTruthy();
      } else {
        const line = t(`dashboard.landing.pilot.form.error.${next.status}`);
        await waitFor(() => expect(screen.getByText(line)).toBeTruthy());
      }
      expect(intlErrors).toEqual([]);
      expect(rawKeys(container)).toEqual([]);
      unmount();
    }
  });

  it("replaces the form with Sent in Russian", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { container } = renderPilot({
      status: "sent",
      reference: null,
      request: { ...VALUES, role: "exam_office", students: "from100" },
    });
    await submit();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: t("dashboard.landing.pilot.sent.title") })).toBeTruthy(),
    );
    expect(container.textContent).toContain("dana.akhmetova@kru.test");
    expect(container.textContent).toContain("ноябрь 2026");
    expect(screen.getByText("sent band")).toBeTruthy();
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });
});

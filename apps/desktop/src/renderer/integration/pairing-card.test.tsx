import { cleanup, render, screen } from "@testing-library/react";
import { type Locale, loadMessages } from "@uki/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { UkiIntlProvider } from "../i18n/uki-intl-provider.tsx";
import { PairingCard } from "./pairing-card.tsx";

const STARTS = Date.parse("2026-10-09T14:00:00+05:00");

afterEach(cleanup);

function renderCard(
  locale: Locale,
  exam: { title: string; startsAt: number } | null,
  now = STARTS - 3_600_000,
) {
  render(
    <UkiIntlProvider initialLocale={locale}>
      <PairingCard pairing={{ code: "482913", exam }} now={now} />
    </UkiIntlProvider>,
  );
  return screen.getByRole("dialog");
}

describe("PairingCard", () => {
  it.each(["kk", "ru", "en"] as const)("renders E.3's app card from the catalog in %s", (locale) => {
    const messages = loadMessages(locale);
    const card = renderCard(locale, { title: "Physics 1 · Quiz 3", startsAt: STARTS });
    expect(screen.getByRole("heading").textContent).toBe(messages.pair.card.title);
    expect(card.textContent).toContain(messages.pair.card.body);
    expect(card.textContent).toContain("482 913");
    expect(card.textContent).toContain("Physics 1 · Quiz 3");
    expect(card.textContent).toContain("14:00");
    expect(card.textContent).not.toMatch(/pair\.card|\{exam\}|\{when\}/);
  });

  it("says the date when the exam is not today", () => {
    const card = renderCard("en", { title: "Physics 1 · Quiz 3", startsAt: STARTS }, STARTS - 2 * 86_400_000);
    expect(card.textContent).toContain("Fri 9 Oct 14:00");
  });

  it("leaves out the next line before a join", () => {
    const card = renderCard("en", null);
    expect(card.textContent).not.toContain("Next:");
  });
});

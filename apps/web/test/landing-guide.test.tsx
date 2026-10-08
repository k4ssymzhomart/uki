// The jury guide and the download block on `/` (the user's decisions of 8 October; no Figma frame):
// both render from the messages in Russian and English with no next-intl error and no raw key, the guide
// opens as a dialog from its button and closes again, and it never shows a login.
import { act, fireEvent, screen, within } from "@testing-library/react";
import en from "@uki/i18n/messages/en.json";
import ru from "@uki/i18n/messages/ru.json";
import { describe, expect, it } from "vitest";
import { DownloadSection } from "../src/features/landing/download-section.tsx";
import { JuryGuide } from "../src/features/landing/jury-guide.tsx";
import type { DashboardLocale } from "../src/i18n/locale.ts";
import { intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

type Tree = { [key: string]: string | Tree };

/** The message at a dotted key. */
function t(locale: DashboardLocale, key: string): string {
  let node: string | Tree | undefined = (locale === "ru" ? ru : en) as Tree;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (typeof node !== "string") throw new Error(`no ${locale} message ${key}`);
  return node;
}

function openGuide(locale: DashboardLocale): HTMLElement {
  renderWithIntl(<JuryGuide />, null, locale);
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: t(locale, "dashboard.landing.guide.title") }));
  });
  return screen.getByRole("dialog", { name: t(locale, "dashboard.landing.guide.title") });
}

describe.each(["ru", "en"] as const)("the jury guide in %s", (locale) => {
  it("opens from its button with the five steps and closes with the close icon", () => {
    const dialog = openGuide(locale);
    const steps = within(dialog).getAllByRole("heading", { level: 3 });
    expect(steps.map((step) => step.textContent)).toEqual(
      ["what", "signIn", "app", "lock", "look"].map(
        (id, index) => `${index + 1}${t(locale, `dashboard.landing.guide.${id}.title`)}`,
      ),
    );
    expect(within(dialog).getByText(t(locale, "dashboard.landing.guide.hello"))).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("link", { name: t(locale, "dashboard.landing.guide.signIn.action") })
        .getAttribute("href"),
    ).toBe("/sign-in");
    for (const id of ["app", "lock"]) {
      expect(
        within(dialog)
          .getByRole("link", { name: t(locale, `dashboard.landing.guide.${id}.action`) })
          .getAttribute("href"),
      ).toBe("/#download");
    }
    for (const point of ["wall", "ask", "flag", "report", "video"]) {
      expect(within(dialog).getByText(t(locale, `dashboard.landing.guide.look.${point}.title`))).toBeTruthy();
    }
    // The demo login is given in person: no address and no password on the page.
    expect(dialog.textContent).not.toMatch(/@|password|пароль/i);
    expect(intlErrors).toEqual([]);
    expect(rawKeys(document.body)).toEqual([]);

    act(() => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: t(locale, "dashboard.landing.guide.close") }),
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when one of its links is followed", () => {
    const dialog = openGuide(locale);
    act(() => {
      fireEvent.click(
        within(dialog).getByRole("link", { name: t(locale, "dashboard.landing.guide.app.action") }),
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe.each(["ru", "en"] as const)("the download block in %s", (locale) => {
  it("links each installer and both Lock zips in the latest release", () => {
    const { container } = renderWithIntl(<DownloadSection />, null, locale);
    const section = screen.getByRole("region", { name: t(locale, "dashboard.landing.download.title") });
    const hrefs = within(section)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    const latest = "https://github.com/k4ssymzhomart/uki/releases/latest";
    expect(hrefs).toEqual([
      `${latest}/download/Uki-mac-arm64.dmg`,
      `${latest}/download/Uki-mac-x64.dmg`,
      `${latest}/download/Uki-Setup-win-x64.exe`,
      `${latest}/download/Uki-win-x64.zip`,
      `${latest}/download/Uki-Lock-chrome.zip`,
      `${latest}/download/Uki-Lock-edge.zip`,
      latest,
    ]);
    expect(
      within(section).getByRole("link", { name: t(locale, "dashboard.landing.download.lock.edgeLabel") }),
    ).toBeTruthy();
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });
});

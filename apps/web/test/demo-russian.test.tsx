// The judge path's screens in Russian (and English): the jury page's body (/demo), /demo/live's notices
// and the landing's Live demo entry points render from the messages with no next-intl error and no raw
// key. The jury page shows the jury's email and where the password is, never a password.
import { act, fireEvent, screen, within } from "@testing-library/react";
import en from "@uki/i18n/messages/en.json";
import ru from "@uki/i18n/messages/ru.json";
import { describe, expect, it, vi } from "vitest";
import { DemoContent } from "../src/features/demo/demo-content.tsx";
import { DemoLiveNotice } from "../src/features/demo/demo-live-notice.tsx";
import { MobileMenu } from "../src/features/landing/mobile-menu.tsx";
import type { DashboardLocale } from "../src/i18n/locale.ts";
import { intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

vi.mock("next/image", () => import("./next-image-mock.tsx"));

type Tree = { [key: string]: string | Tree };

/** The message at a dotted key. */
function t(locale: DashboardLocale, key: string): string {
  let node: string | Tree | undefined = (locale === "ru" ? ru : en) as Tree;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (typeof node !== "string") throw new Error(`no ${locale} message ${key}`);
  return node;
}

const LATEST = "https://github.com/k4ssymzhomart/uki/releases/latest";
const LIVE_DEMO = "/sign-in?email=judge%40kru.test&next=/demo/live";

function hrefOf(name: string): string | null {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe.each(["ru", "en"] as const)("the jury page in %s", (locale) => {
  const m = (key: string) => t(locale, `dashboard.landing.demo.${key}`);

  it("shows the live demo, the jury's email, where the password is, and every link", () => {
    const { container } = renderWithIntl(<DemoContent video={{ kind: "none" }} />, null, locale);
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);

    const dashboard = screen.getByRole("region", { name: m("dashboard.title") });
    expect(within(dashboard).getByText("judge@kru.test")).toBeTruthy();
    expect(within(dashboard).getByText(m("dashboard.passwordWhere"))).toBeTruthy();
    expect(hrefOf(m("dashboard.liveDemo"))).toBe(LIVE_DEMO);
    expect(hrefOf(m("dashboard.open"))).toBe("/sign-in");
    expect(hrefOf(m("try.action"))).toBe("/try");
    expect(container.querySelector("input")).toBeNull();

    const tries = screen.getByRole("region", { name: m("tries.title") });
    expect(
      within(tries)
        .getAllByRole("heading", { level: 3 })
        .map((node) => node.textContent),
    ).toEqual(["flags", "ask", "report"].map((id) => m(`tries.${id}.title`)));

    // The placeholder says what will be there until NEXT_PUBLIC_DEMO_VIDEO_URL is set.
    const video = screen.getByRole("region", { name: m("video.title") });
    expect(within(video).getByText(m("video.soon.title"))).toBeTruthy();
    expect(within(video).queryByRole("link")).toBeNull();

    const apps = screen.getByRole("region", { name: m("apps.title") });
    const files = within(apps)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(files).toEqual([
      ...[
        "Uki-mac-arm64.dmg",
        "Uki-mac-x64.dmg",
        "Uki-Setup-win-x64.exe",
        "Uki-win-x64.zip",
        "Uki-Lock-chrome.zip",
        "Uki-Lock-edge.zip",
      ].map((file) => `${LATEST}/download/${file}`),
      LATEST,
    ]);
  });

  it("links the demo video once its address is set, in a new tab", () => {
    renderWithIntl(
      <DemoContent video={{ kind: "link", url: "https://example.com/uki.mp4" }} />,
      null,
      locale,
    );
    const link = screen.getByRole("link", { name: new RegExp(m("video.watch")) });
    expect(link.getAttribute("href")).toBe("https://example.com/uki.mp4");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(screen.queryByText(m("video.soon.title"))).toBeNull();
    expect(intlErrors).toEqual([]);
  });
});

describe.each(["ru", "en"] as const)("/demo/live's notices in %s", (locale) => {
  const m = (key: string) => t(locale, `dashboard.landing.demoLive.${key}`);

  it("says the live demo is not running yet, with the exam's code, Try again and the dashboard", () => {
    const { container } = renderWithIntl(<DemoLiveNotice kind="missing" />, null, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(m("missing.title"));
    expect(container.textContent).toContain("DEMO-LIVE");
    expect(hrefOf(m("retry"))).toBe("/demo/live");
    expect(hrefOf(m("dashboard"))).toBe("/");
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });

  it("says it could not reach Üki, with Try again only", () => {
    const { container } = renderWithIntl(<DemoLiveNotice kind="failed" />, null, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(m("failed.title"));
    expect(hrefOf(m("retry"))).toBe("/demo/live");
    expect(screen.queryByRole("link", { name: m("dashboard") })).toBeNull();
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });
});

describe.each(["ru", "en"] as const)("the 390 menu in %s", (locale) => {
  it("has Live demo after Sign in", () => {
    renderWithIntl(<MobileMenu />, null, locale);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: t(locale, "dashboard.landing.nav.openMenu") }));
    });
    const menu = screen.getByRole("navigation", { name: t(locale, "dashboard.landing.nav.label") });
    const names = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    const signIn = names.indexOf(t(locale, "dashboard.landing.nav.signIn"));
    expect(names[signIn + 1]).toBe(t(locale, "dashboard.landing.nav.liveDemo"));
    expect(hrefOf(t(locale, "dashboard.landing.nav.liveDemo"))).toBe(LIVE_DEMO);
    expect(intlErrors).toEqual([]);
  });
});

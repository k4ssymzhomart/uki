// 0.8 rendered in Kazakh, Russian and English: the HTML (pretty-printed) and the plain-text part are
// file snapshots in __snapshots__/, which are also the pages docs/evidence/phase-1/1.4 compares with
// the frame. The template fill must equal a direct render, and the email carries nothing that tracks.
import { pretty } from "@react-email/render";
import { describe, expect, it } from "vitest";
import {
  EMAIL_IMAGES,
  fillInvite,
  type InviteExam,
  type InviteSettings,
  type InviteStudent,
  inviteTimes,
  renderInvite,
  renderInviteTemplate,
} from "./email.tsx";
import { EMAIL_LOCALES, formatEmailMessage } from "./messages.ts";
import { SANS } from "./theme.ts";

// Frame 0.8: Mathematics 2 · Midterm on Friday 9 October at 10:00 in Almaty (05:00 UTC), lobby at 09:40.
const EXAM: InviteExam = {
  title: "Mathematics 2 · Midterm",
  code: "MATH2-204-FRI",
  startsAt: "2026-10-09T05:00:00Z",
  lobbyOpensAt: "2026-10-09T04:40:00Z",
  timeZone: "Asia/Almaty",
};
const MADINA: InviteStudent = { name: "Madina Tulegenova", number: "20231187", group: "204" };
const SETTINGS: InviteSettings = {
  office: "KRU",
  downloadUrl: "https://github.com/k4ssymzhomart/uki/releases/latest",
  assetsUrl: "https://uki.example/email",
  test: false,
};

describe("inviteTimes", () => {
  it("reads the day and times in the workspace's time zone", () => {
    expect(inviteTimes(EXAM)).toEqual({
      weekday: "fri",
      day: "9",
      month: "oct",
      time: "10:00",
      lobby: "09:40",
    });
  });

  it("moves to the next day when Almaty is past midnight", () => {
    const late = { ...EXAM, startsAt: "2026-12-31T20:30:00Z", lobbyOpensAt: "2026-12-31T20:10:00Z" };
    expect(inviteTimes(late)).toEqual({
      weekday: "fri",
      day: "1",
      month: "jan",
      time: "01:30",
      lobby: "01:10",
    });
  });
});

describe("renderInvite", () => {
  it.each(EMAIL_LOCALES)("renders 0.8 in %s (HTML and text snapshots)", async (locale) => {
    const email = await renderInvite(locale, EXAM, MADINA, SETTINGS);
    expect(email.subject).toBe(formatEmailMessage(locale, "email.invite.subject", { exam: EXAM.title }));
    await expect(await pretty(email.html)).toMatchFileSnapshot(`__snapshots__/invite.${locale}.html`);
    await expect(`${email.text}\n`).toMatchFileSnapshot(`__snapshots__/invite.${locale}.txt`);

    expect(email.html).toContain(`<html dir="ltr" lang="${locale}">`);
    expect(email.html).toContain(">MATH2-204-FRI<");
    expect(email.html).toContain(">20231187<");
    expect(email.text).toContain(SETTINGS.downloadUrl);
    expect(email.text).toContain("Madina Tulegenova");
  });

  it("writes the Kazakh letters as text, with the system font stack around them", async () => {
    const email = await renderInvite("kk", EXAM, MADINA, SETTINGS);
    expect(email.html).toContain("Емтиханыңыз жұма күні, сағат\u00a010:00.");
    expect(email.html).toContain("9\u00a0қазан");
    expect(email.html).not.toMatch(/&#x4[0-9a-f]{2};/i); // no Cyrillic as character references
    expect(email.html).toContain("font-family:-apple-system, BlinkMacSystemFont");
    expect(SANS).toMatch(/Segoe UI.*Roboto.*Arial/);
    expect(email.html).not.toMatch(/@font-face|fonts\.googleapis|<link/);
  });

  it("carries nothing that tracks: three static images, one link, no query strings", async () => {
    for (const locale of EMAIL_LOCALES) {
      const { html } = await renderInvite(locale, EXAM, MADINA, SETTINGS);
      const images = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
      expect(images.sort()).toEqual(
        Object.values(EMAIL_IMAGES)
          .map((image) => `${SETTINGS.assetsUrl}/${image.file}`)
          .sort(),
      );
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(links).toEqual([SETTINGS.downloadUrl]);
      expect(html).not.toMatch(/\?[a-z_]+=/i);
    }
  });

  it("leaves the images out when no dashboard address is set, and keeps the wordmark as text", async () => {
    const email = await renderInvite("en", EXAM, MADINA, { ...SETTINGS, assetsUrl: null });
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain(">Üki<");
  });

  it("names the roster instead of a group for a student without one", async () => {
    const email = await renderInvite("ru", EXAM, { ...MADINA, group: null }, SETTINGS);
    expect(email.text).toContain(
      formatEmailMessage("ru", "email.invite.footer_roster", { name: MADINA.name, office: "KRU" }),
    );
  });

  it("gives the test invite its own subject", async () => {
    const email = await renderInvite("kk", EXAM, MADINA, { ...SETTINGS, test: true });
    expect(email.subject).toBe(formatEmailMessage("kk", "email.invite.test_subject", { exam: EXAM.title }));
  });
});

describe("renderInviteTemplate and fillInvite", () => {
  const people: InviteStudent[] = [
    MADINA,
    { name: `Aisha O'Neil & <Co> "Q"`, number: "20230001", group: "2<04" },
    { name: "Әлия Қасымова", number: "20230002", group: null },
  ];

  it.each(EMAIL_LOCALES)("fills the %s template exactly as a direct render", async (locale) => {
    for (const student of people) {
      const template = await renderInviteTemplate(locale, EXAM, student.group !== null, SETTINGS);
      expect(fillInvite(template, student)).toEqual(await renderInvite(locale, EXAM, student, SETTINGS));
    }
  });

  it("refuses a student whose group line the template does not have", async () => {
    const template = await renderInviteTemplate("en", EXAM, false, SETTINGS);
    expect(() => fillInvite(template, MADINA)).toThrow(/group/);
  });
});

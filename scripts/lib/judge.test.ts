import { describe, expect, it } from "vitest";
import { JUDGE_EMAIL, StudentNumber } from "../../packages/contracts/src/index.ts";
import {
  appendEnvLine,
  demoLiveRun,
  demoRoster,
  generatePassword,
  isInside,
  liveDemoUrl,
  needsNewRun,
  readEnvValue,
  renderOnePager,
} from "./judge.ts";

const NOW = Date.parse("2026-10-12T09:00:00Z");

describe("judge setup", () => {
  it("makes 30 students with distinct names on seats 1 to 30, mostly in Kazakh", () => {
    const roster = demoRoster();
    expect(roster).toHaveLength(30);
    expect(new Set(roster.map((s) => s.fullName)).size).toBe(30);
    expect(roster.map((s) => s.seat)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const student of roster) expect(StudentNumber.parse(student.number)).toBe(student.number);
    expect(roster.filter((s) => s.locale === "kk").length).toBeGreaterThan(15);
    // None of the seeded staff or the demo's two real students.
    for (const name of ["Madina", "Aliya", "Aigerim", "Dana ", "Gulnara", "Nurlan "]) {
      expect(roster.some((s) => s.fullName.startsWith(name))).toBe(false);
    }
  });

  it("starts a run now, for 720 minutes, with the lobby open", () => {
    expect(demoLiveRun(NOW)).toEqual({
      starts_at: "2026-10-12T09:00:00.000Z",
      lobby_opens_at: "2026-10-12T09:00:00.000Z",
      duration_min: 720,
      status: "live",
    });
  });

  it("keeps a live run with 30 minutes or more left, as demo_live_tick does", () => {
    const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
    expect(needsNewRun({ status: "live", starts_at: at(10), duration_min: 720 }, NOW)).toBe(false);
    expect(needsNewRun({ status: "live", starts_at: at(690), duration_min: 720 }, NOW)).toBe(false);
    expect(needsNewRun({ status: "live", starts_at: at(691), duration_min: 720 }, NOW)).toBe(true);
    expect(needsNewRun({ status: "to_review", starts_at: at(10), duration_min: 720 }, NOW)).toBe(true);
    expect(needsNewRun({ status: "live", starts_at: at(-60), duration_min: 720 }, NOW)).toBe(true);
  });

  it("makes a 24-character password, different each time", () => {
    const a = generatePassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(generatePassword()).not.toBe(a);
    expect(generatePassword(() => Buffer.alloc(18, 1))).toBe("AQEBAQEBAQEBAQEBAQEBAQEB");
  });

  it("reads JUDGE_PASSWORD from the env file and appends it when absent, keeping every other line", () => {
    const text = "SUPABASE_URL=https://x.supabase.co\r\nSUPABASE_SECRET_KEY=sb_secret_x";
    expect(readEnvValue(text, "JUDGE_PASSWORD")).toBeNull();
    const added = appendEnvLine(text, "JUDGE_PASSWORD", "abc_DEF-123");
    expect(added).toBe(`${text}\r\nJUDGE_PASSWORD=abc_DEF-123\r\n`);
    expect(readEnvValue(added, "JUDGE_PASSWORD")).toBe("abc_DEF-123");
    expect(readEnvValue('JUDGE_PASSWORD="quoted"\n', "JUDGE_PASSWORD")).toBe("quoted");
    expect(readEnvValue("JUDGE_PASSWORD=\n", "JUDGE_PASSWORD")).toBeNull();
    expect(appendEnvLine("", "K", "v")).toBe("K=v\n");
    expect(() => appendEnvLine("", "K", "a b")).toThrow();
  });

  it("refuses a one-pager inside the repository", () => {
    expect(isInside("/repo/uki/notes.md", "/repo/uki")).toBe(true);
    expect(isInside("/repo/uki/docs/a/b.md", "/repo/uki/")).toBe(true);
    expect(isInside("/repo/uki-judge-one-pager.md", "/repo/uki")).toBe(false);
    expect(isInside("/repo/uki-wt/x.md", "/repo/uki")).toBe(false);
  });

  it("writes the one-pager with the links, the email and the password", () => {
    const page = renderOnePager({
      dashboardUrl: "https://uki-web.vercel.app/",
      password: "pw-123",
      generatedAt: new Date(NOW),
    });
    expect(liveDemoUrl("https://uki-web.vercel.app")).toBe(
      "https://uki-web.vercel.app/sign-in?email=judge%40kru.test&next=/demo/live",
    );
    expect(page).toContain(
      "| Live demo | https://uki-web.vercel.app/sign-in?email=judge%40kru.test&next=/demo/live |",
    );
    expect(page).toContain(`| Email | ${JUDGE_EMAIL} |`);
    expect(page).toContain("| Password | pw-123 |");
    expect(page).toContain("https://uki-web.vercel.app/demo");
    expect(page).toContain("https://uki-web.vercel.app/try");
    expect(page.match(/^\d\. \*\*/gm)).toHaveLength(3);
  });
});

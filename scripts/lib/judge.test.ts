import { describe, expect, it } from "vitest";
import { JUDGE_EMAIL, StudentNumber } from "../../packages/contracts/src/index.ts";
import {
  appendEnvLine,
  demoLiveChecks,
  demoLiveRun,
  demoRoster,
  describeCounts,
  generatePassword,
  isInside,
  liveDemoUrl,
  needsNewRun,
  parseSeatNumber,
  RELEASES_URL,
  readEnvValue,
  realAppRange,
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

  it("tells judges to try the real app with DEMO-LIVE and the free IDs, with the release link", () => {
    const page = renderOnePager({
      dashboardUrl: "https://uki-web.vercel.app",
      password: "pw",
      generatedAt: new Date(NOW),
    });
    expect(realAppRange()).toBe("20249026–20249030");
    expect(page).toContain("Try the real app: download Üki, code DEMO-LIVE, student ID 20249026–20249030.");
    expect(page).toContain(RELEASES_URL);
    expect(RELEASES_URL).toBe("https://github.com/k4ssymzhomart/uki/releases/latest");
  });

  it("gives DEMO-LIVE lock and identity off and phones at 0.55, keeping every other check", () => {
    expect(demoLiveChecks(null)).toEqual({
      gaze_s: 2,
      phone_score: 0.55,
      face_missing_s: 10,
      identity: false,
      lock: false,
    });
    const tuned = { gaze_s: 3, phone_score: 0.85, face_missing_s: 15, identity: true, lock: true };
    expect(demoLiveChecks(tuned)).toEqual({
      gaze_s: 3,
      phone_score: 0.55,
      face_missing_s: 15,
      identity: false,
      lock: false,
    });
    // A second run changes nothing.
    expect(demoLiveChecks(demoLiveChecks(tuned))).toEqual(demoLiveChecks(tuned));
    expect(() => demoLiveChecks({ gaze_s: -1 })).toThrow();
  });
});

describe("judge free-seat", () => {
  it("takes exactly one DEMO-LIVE roster number", () => {
    expect(parseSeatNumber(["20249026"])).toEqual({ number: "20249026" });
    expect(parseSeatNumber([" 20249030 "])).toEqual({ number: "20249030" });
    expect(parseSeatNumber(["20249001"])).toEqual({ number: "20249001" });
    expect(parseSeatNumber([])).toEqual({ error: "give one student number, 20249001 to 20249030" });
    expect(parseSeatNumber(["20249026", "20249027"])).toHaveProperty("error");
    expect(parseSeatNumber(["20249031"])).toEqual({
      error: "20249031 is not on DEMO-LIVE's roster (20249001 to 20249030)",
    });
    expect(parseSeatNumber(["26"])).toHaveProperty("error");
    expect(parseSeatNumber(["20231187"])).toHaveProperty("error");
  });

  it("reports what it deleted, without the zeros", () => {
    const none = {
      sessions: 0,
      reports: 0,
      review_decisions: 0,
      help_requests: 0,
      session_commands: 0,
      frames: 0,
      events: 0,
      answers: 0,
    };
    expect(describeCounts(none)).toBe("nothing");
    expect(describeCounts({ ...none, sessions: 1, events: 6, frames: 1, answers: 2, help_requests: 1 })).toBe(
      "1 session, 6 events, 1 frames row, 2 answers, 1 help request",
    );
  });
});

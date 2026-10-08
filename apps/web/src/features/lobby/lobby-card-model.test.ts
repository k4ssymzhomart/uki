// WP 1.5: the lobby model's parts for 1.5a (the student card) and 1.5b (Identity help).
import { parseStatusDetail } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import {
  cardTriesMeta,
  checkInProgress,
  firstName,
  identityHelpLog,
  LobbySession,
  lobbyRow,
  parseRows,
  problemFact,
  RosterEntry,
  stuckOnIdentity,
} from "./lobby-model.ts";

const entry = RosterEntry.parse({
  student_id: "b0000000-0000-4000-8000-000020231187",
  seat: 23,
  invite_status: "sent",
  student: { full_name: "Madina Tulegenova", student_number: "20231187", group: { code: "204" } },
});

function sessionAt(state: string, detail?: string, locale?: string) {
  const [session] = parseRows(LobbySession, [
    {
      id: "5e550000-0000-4000-8000-000000000023",
      student_id: entry.student_id,
      state,
      status: detail ? { step: state, detail } : { step: state },
      device: { os: "macos", app_version: "1.4.2" },
      ...(locale ? { locale } : {}),
    },
  ]);
  if (!session) throw new Error("session did not parse");
  return session;
}

describe("1.5a: where a student is in check-in", () => {
  it("puts the steps before the current one at done, a held step at warn and the rest at todo", () => {
    const states = (state: Parameters<typeof checkInProgress>[0], detail?: string) =>
      checkInProgress(state, parseStatusDetail(detail)).steps.map((step) => step.state);
    expect(checkInProgress("identity", parseStatusDetail("card:retry:2")).step).toBe(2);
    expect(states("identity", "card:retry:2")).toEqual(["done", "warn", "todo", "todo"]);
    expect(states("checking", "app:Telegram")).toEqual(["warn", "todo", "todo", "todo"]);
    expect(states("checking")).toEqual(["todo", "todo", "todo", "todo"]);
    expect(states("joined")).toEqual(["todo", "todo", "todo", "todo"]);
    expect(states("rules")).toEqual(["done", "done", "todo", "todo"]);
    expect(states("ready")).toEqual(["done", "done", "done", "done"]);
    expect(states("writing")).toEqual(["done", "done", "done", "done"]);
    expect(checkInProgress("ready", null).steps.map((step) => step.id)).toEqual([
      "system",
      "identity",
      "rules",
      "ready",
    ]);
  });

  it("says retry n of 3 while the student still tries and n of 3 tries on 1.3a", () => {
    expect(cardTriesMeta(parseStatusDetail("card:retry:2"))).toEqual({ key: "retry", attempt: 2, max: 3 });
    expect(cardTriesMeta(parseStatusDetail("card:help:3"))).toEqual({ key: "tries", tries: 3, max: 3 });
    expect(cardTriesMeta(parseStatusDetail("app:Telegram"))).toBeNull();
    expect(cardTriesMeta(null)).toBeNull();
  });

  it("names the problem as the lobby does, the card as Card unreadable, and nothing Figma has no string for", () => {
    expect(problemFact(parseStatusDetail("app:Telegram"))).toEqual({ key: "appOpen", app: "Telegram" });
    expect(problemFact(parseStatusDetail("camera:busy"))).toEqual({ key: "cameraBlocked" });
    expect(problemFact(parseStatusDetail("card:help:3"))).toEqual({ key: "cardUnreadable" });
    expect(problemFact(parseStatusDetail("camera:dark"))).toBeNull();
    expect(problemFact(parseStatusDetail("network:slow"))).toBeNull();
    expect(problemFact(null)).toBeNull();
  });

  it("carries the group, the state, the problem and the app language on the row", () => {
    expect(lobbyRow(entry, sessionAt("identity", "card:help:3", "en"))).toMatchObject({
      group: "204",
      state: "identity",
      problem: { kind: "card", problem: "help", tries: 3 },
      locale: "en",
      detail: { key: "cardHelp", tries: 3, max: 3 },
    });
    // sessions.locale is not null in the database; a row without it reads as Kazakh, the students' default.
    expect(lobbyRow(entry, sessionAt("ready")).locale).toBe("kk");
    expect(lobbyRow(entry, null)).toMatchObject({ state: null, problem: null, locale: null, group: "204" });
    // A roster row without a group (or an unreadable one) has none.
    const loose = RosterEntry.parse({
      ...entry,
      student: { full_name: "A B", student_number: "1", group: 7 },
    });
    expect(lobbyRow(loose, null).group).toBeNull();
  });
});

describe("1.5b: who gets Identity help, and what its log shows", () => {
  it("is for students held at the identity check by the card", () => {
    expect(stuckOnIdentity(lobbyRow(entry, sessionAt("identity", "card:help:3")))).toBe(true);
    expect(stuckOnIdentity(lobbyRow(entry, sessionAt("identity", "card:retry:1")))).toBe(true);
    expect(stuckOnIdentity(lobbyRow(entry, sessionAt("identity")))).toBe(false);
    expect(stuckOnIdentity(lobbyRow(entry, sessionAt("checking", "camera:busy")))).toBe(false);
    expect(stuckOnIdentity(lobbyRow(entry, null))).toBe(false);
  });

  it("lists identity help requests and messages, oldest first, and leaves out the exam's own topics", () => {
    const event = (type: string, at: string, data: Record<string, unknown> = {}) => ({ type, at, data });
    const log = identityHelpLog([
      event("proctor.message", "2026-10-09T04:53:10Z", { text: "Tilt the card", scope: "student" }),
      event("student.help_requested", "2026-10-09T04:52:05Z", { topic: "identity" }),
      event("student.help_requested", "2026-10-09T04:55:00Z", { topic: "question" }),
      event("identity.matched", "2026-10-09T04:56:00Z", { score: 0.8, tries: 4 }),
    ]);
    expect(log.map((item) => `${item.type} ${item.at}`)).toEqual([
      "student.help_requested 2026-10-09T04:52:05Z",
      "proctor.message 2026-10-09T04:53:10Z",
    ]);
  });

  it("writes the hint's addressee by first name", () => {
    expect(firstName("Madina Tulegenova")).toBe("Madina");
    expect(firstName("  Aruzhan  ")).toBe("Aruzhan");
  });
});

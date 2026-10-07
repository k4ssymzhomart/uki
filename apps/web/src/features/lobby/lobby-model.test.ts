import { describe, expect, it } from "vitest";
import {
  applySessionUpdate,
  canStartExam,
  defaultLobbyFilter,
  LobbyExam,
  LobbySession,
  lobbyCounts,
  lobbyRow,
  lobbyRows,
  mergeSessions,
  parseRows,
  RosterEntry,
  visibleRows,
} from "./lobby-model.ts";

const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n: number) => `5e550000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function student(n: number, name: string, number: string, seat: number, invite = "sent") {
  return {
    student_id: id(n),
    seat,
    invite_status: invite,
    student: { full_name: name, student_number: number },
  };
}

function session(n: number, state: string, status: Record<string, unknown> = {}, device: unknown = {}) {
  return { id: sid(n), student_id: id(n), state, status, device };
}

// The 1.5 frame: three need help, one not joined (bounced), two ready, plus one not joined who opened
// the invite and one still checking without a problem.
const roster = parseRows(RosterEntry, [
  student(1, "Dias Kenzhebekov", "20231044", 12),
  student(2, "Arman Bekzhanov", "20230912", 5),
  student(3, "Aruzhan Kassymova", "20231219", 14),
  student(4, "Yerlan Tokhtarov", "20230877", 41, "bounced"),
  student(5, "Madina Tulegenova", "20231187", 23),
  student(6, "Zhansaya Omarova", "20231302", 33),
  student(7, "Aliya Nurlanovna", "20235007", 7, "opened"),
  student(8, "Bolat Serikov", "20235008", 8),
]);
const sessions = parseRows(LobbySession, [
  session(
    1,
    "identity",
    { step: "identity", detail: "card_retry:2" },
    { os: "windows", app_version: "0.1.0" },
  ),
  session(2, "checking", { step: "checking", detail: "Telegram" }, { os: "macos", app_version: "0.1.0" }),
  session(
    3,
    "checking",
    { step: "checking", detail: "camera_blocked" },
    { os: "windows", app_version: "0.1.0" },
  ),
  session(5, "ready", { step: "ready" }, { os: "macos", app_version: "0.1.0" }),
  session(6, "rules", { step: "rules" }, { os: "windows", app_version: "0.1.0" }),
  session(8, "checking", { step: "checking" }),
]);
const rows = lobbyRows(roster, sessions);
const byName = (name: string) => rows.find((row) => row.name === name);

describe("lobby rows", () => {
  it("shows the step, the detail from sessions.status and the device from sessions.device", () => {
    expect(byName("Dias Kenzhebekov")).toMatchObject({
      category: "needHelp",
      step: "identity",
      detail: { key: "cardRetry", attempt: 2, max: 3 },
      device: { os: "windows", version: "0.1.0" },
      chip: { status: "warn", key: "needsHelp" },
    });
    expect(byName("Arman Bekzhanov")).toMatchObject({
      step: "checking",
      detail: { key: "appOpen", app: "Telegram" },
    });
    expect(byName("Aruzhan Kassymova")?.detail).toEqual({ key: "cameraBlocked" });
  });

  it("shows students who have not joined, with a bounced invite as the detail", () => {
    expect(byName("Yerlan Tokhtarov")).toMatchObject({
      category: "notJoined",
      step: "notJoined",
      detail: { key: "bounced" },
      device: null,
      sessionId: null,
      chip: { status: "idle", key: "notJoined" },
    });
    expect(byName("Aliya Nurlanovna")?.detail).toBeNull();
  });

  it("counts rules and ready as Ready, waiting for the start once ready", () => {
    expect(byName("Madina Tulegenova")).toMatchObject({
      category: "ready",
      step: "rules",
      detail: { key: "waiting" },
      chip: { status: "ok", key: "ready" },
    });
    expect(byName("Zhansaya Omarova")).toMatchObject({ category: "ready", step: "rules", detail: null });
  });

  it("keeps a check without a problem as checking in, and an unreadable device as none", () => {
    expect(byName("Bolat Serikov")).toMatchObject({ category: "checking", device: null, detail: null });
  });

  it("reads an app: detail and shows unknown details as they are", () => {
    const entry = roster[0] as RosterEntry;
    const at = (state: string, detail: string) =>
      lobbyRow(entry, parseRows(LobbySession, [session(1, state, { detail })])[0] ?? null).detail;
    expect(at("checking", "app:Discord")).toEqual({ key: "appOpen", app: "Discord" });
    expect(at("identity", "Card is upside down")).toEqual({ key: "text", text: "Card is upside down" });
    expect(at("writing", "anything")).toEqual({ key: "text", text: "anything" });
  });

  it("moves writing and finished sessions out of the check-in categories", () => {
    const entry = roster[0] as RosterEntry;
    const of = (state: string) => lobbyRow(entry, parseRows(LobbySession, [session(1, state)])[0] ?? null);
    expect(of("writing")).toMatchObject({ category: "writing", step: "writing", chip: { key: "writing" } });
    expect(of("paused")).toMatchObject({ category: "writing", chip: { status: "warn", key: "paused" } });
    expect(of("submitted")).toMatchObject({ category: "done", step: "finished", chip: { key: "done" } });
  });
});

describe("lobby counts", () => {
  it("counts the banner, the stat cards and the tabs", () => {
    expect(lobbyCounts(rows, roster)).toEqual({
      total: 8,
      joined: 6,
      ready: 2,
      needHelp: 3,
      notJoined: 2,
      invitesOpened: 1,
    });
  });
});

describe("lobby filters and search", () => {
  it("opens on Need help, or on All when nobody needs help", () => {
    expect(defaultLobbyFilter(lobbyCounts(rows, roster))).toBe("needHelp");
    const calm = lobbyRows(roster, []);
    expect(defaultLobbyFilter(lobbyCounts(calm, roster))).toBe("all");
  });

  it("filters by tab and orders need help, not joined, checking, ready; then by seat", () => {
    const names = (filter: Parameters<typeof visibleRows>[1], query = "") =>
      visibleRows(rows, filter, query).map((row) => row.name);
    expect(names("needHelp")).toEqual(["Arman Bekzhanov", "Dias Kenzhebekov", "Aruzhan Kassymova"]);
    expect(names("notJoined")).toEqual(["Aliya Nurlanovna", "Yerlan Tokhtarov"]);
    expect(names("ready")).toEqual(["Madina Tulegenova", "Zhansaya Omarova"]);
    expect(names("all")).toEqual([
      "Arman Bekzhanov",
      "Dias Kenzhebekov",
      "Aruzhan Kassymova",
      "Aliya Nurlanovna",
      "Yerlan Tokhtarov",
      "Bolat Serikov",
      "Madina Tulegenova",
      "Zhansaya Omarova",
    ]);
  });

  it("searches names and student numbers within the tab", () => {
    expect(visibleRows(rows, "all", "  madina ").map((row) => row.name)).toEqual(["Madina Tulegenova"]);
    expect(visibleRows(rows, "all", "2023104").map((row) => row.number)).toEqual(["20231044"]);
    expect(visibleRows(rows, "ready", "dias")).toEqual([]);
  });
});

describe("Start exam", () => {
  const now = Date.parse("2026-10-09T04:56:00Z");
  const exam = LobbyExam.parse({
    id: "e0000000-0000-4000-8000-000000000001",
    title: "Mathematics 2 · Midterm",
    status: "scheduled",
    starts_at: "2026-10-09T05:00:00+00:00",
    duration_min: 90,
    lobby_opens_at: "2026-10-09T04:40:00+00:00",
    groups: ["204"],
  });

  it("is enabled for the lead proctor and the exam office before the scheduled start", () => {
    expect(canStartExam(exam, { role: "proctor", isLead: true }, now)).toBe(true);
    expect(canStartExam(exam, { role: "exam_office", isLead: false }, now)).toBe(true);
    expect(canStartExam(exam, { role: "admin", isLead: false }, now)).toBe(true);
  });

  it("is disabled for other proctors, after the start and once the exam is live", () => {
    expect(canStartExam(exam, { role: "proctor", isLead: false }, now)).toBe(false);
    expect(canStartExam(exam, { role: "exam_office", isLead: false }, Date.parse(exam.starts_at))).toBe(
      false,
    );
    expect(canStartExam({ ...exam, status: "live" }, { role: "exam_office", isLead: false }, now)).toBe(
      false,
    );
  });
});

describe("lobby realtime", () => {
  it("applies a session message to a known session", () => {
    const result = applySessionUpdate(sessions, {
      id: sid(2),
      state: "identity",
      status: { step: "identity" },
    });
    expect(result.unknown).toBe(false);
    const arman = lobbyRows(roster, result.sessions).find((row) => row.name === "Arman Bekzhanov");
    expect(arman).toMatchObject({ category: "checking", step: "identity", detail: null });
  });

  it("flags an unknown session (a new join) to be read, and merges it once read", () => {
    const result = applySessionUpdate(sessions, { id: sid(4), state: "joined", status: {} });
    expect(result.unknown).toBe(true);
    const fresh = parseRows(LobbySession, [session(4, "joined", {}, { os: "macos", app_version: "0.1.0" })]);
    const merged = mergeSessions(result.sessions, fresh);
    expect(lobbyRows(roster, merged).find((row) => row.name === "Yerlan Tokhtarov")).toMatchObject({
      category: "checking",
      step: "joined",
      device: { os: "macos", version: "0.1.0" },
    });
    expect(mergeSessions(merged, fresh)).toHaveLength(merged.length);
  });
});

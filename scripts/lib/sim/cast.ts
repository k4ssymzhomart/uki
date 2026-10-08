// Who the simulator plays, and which part of the lobby (1.5) and live wall (2.4) script each one acts.
// The named students keep the parts Figma draws for them; every part a named student cannot play (not
// in the cast, or skipped because a real laptop uses that number) goes to the next generic student.
// Seed v2 adds the two Ask proctor requests 2.4d draws (HELP_PARTS).
import type { DesktopOs, HelpTopic, Locale } from "../../../packages/contracts/src/index.ts";
import { createRng } from "./rng.ts";

/** Lobby parts (1.5, frame 61:3347). */
export const LOBBY_ROLES = ["normal", "help_identity", "help_app", "help_camera", "slow", "late"] as const;
export type LobbyRole = (typeof LOBBY_ROLES)[number];

/** Live wall parts (2.4, frame 51:2080), plus the No signal and Done tiles the plan's wall table adds. */
export const WALL_ROLES = [
  "normal",
  "look_away_3x",
  "look_away_once",
  "tab_blocked",
  "second_face",
  "phone",
  "face_missing",
  "camera_lost",
  "offline",
  "early_submit",
] as const;
export type WallRole = (typeof WALL_ROLES)[number];

export interface RosterEntry {
  studentId: string;
  seat: number | null;
  number: string;
  name: string;
  locale: Locale;
}

/** An Ask proctor request (2.4d): when, in simulated ms after the exam's start, and what it says. */
export interface HelpPart {
  atSimMs: number;
  topic: HelpTopic;
  text: string;
}

export interface CastMember extends RosterEntry {
  lobby: LobbyRole;
  wall: WallRole;
  os: DesktopOs;
  /** "Dias K." as the wall writes it. */
  short: string;
  /** The help request this student sends, if any. */
  help?: HelpPart;
}

interface NamedPart {
  lobby?: LobbyRole;
  wall?: WallRole;
  os?: DesktopOs;
}

/**
 * The parts Figma draws, by student number (supabase/seed.sql keeps these numbers). Madina is the real
 * MacBook in the demo, so she is skipped by default and her phone part goes to a generic student.
 */
export const NAMED_PARTS: Readonly<Record<string, NamedPart>> = {
  // 1.5 "Identity check · Card unreadable · retry 2 of 3"; 2.4 "looked away 3× · 6 s"
  "20231044": { lobby: "help_identity", wall: "look_away_3x", os: "windows" },
  // 1.5 "System check · Telegram is open"; 2.4 "second face · 10:45"
  "20230912": { lobby: "help_app", wall: "second_face", os: "macos" },
  // 1.5 "System check · Camera blocked by another app"; 2.4 "looked away 2.4 s"
  "20231219": { lobby: "help_camera", wall: "look_away_once", os: "windows" },
  // 1.5 "Rules · Waiting for the start"; 2.4 "no face · 00:42"
  "20231302": { wall: "face_missing", os: "windows" },
  // 2.4 "tab blocked · 10:44" (Timur N.)
  "20235030": { wall: "tab_blocked" },
  // 2.4 "camera lost · 00:10" (Nurlan A.)
  "20235035": { wall: "camera_lost" },
  // 2.4 "phone 0.94 · 10:47"; only when no real laptop uses her number
  "20231187": { wall: "phone", os: "macos" },
  // 1.5 "Not joined · Invite email bounced": joins only after the start, if at all
  "20230877": { lobby: "late" },
};

/**
 * The two requests 2.4d draws (Figma 155:11803), both in the exam's first three minutes: Saule T. asks
 * about her camera at 10:44 and Kamila R. about question 8 at 10:46. A request whose student is not in
 * the cast goes to the next generic student with no other part. Their texts are what the simulated
 * students type, like a student's answer, not product copy.
 */
export const HELP_PARTS: readonly (HelpPart & { number: string })[] = [
  {
    number: "20235055",
    atSimMs: 70_000,
    topic: "technical",
    text: "My camera froze for a second. Is my exam still running?",
  },
  {
    number: "20235038",
    atSimMs: 160_000,
    topic: "question",
    text: "Q 8: is the angle in radians or degrees?",
  },
];
const HELP_NUMBERS = new Set(HELP_PARTS.map((part) => part.number));

/** The other names on the 2.4 wall, so a small cast still shows them first. */
const WALL_NAMES = [
  "20235002",
  "20235047",
  "20235038",
  "20235026",
  "20235009",
  "20235017",
  "20235055",
  "20235061",
];

/** Parts every run plays, in the order they are handed to generic students when nobody named can. */
const REQUIRED_LOBBY: readonly LobbyRole[] = ["help_identity", "help_app", "help_camera", "slow", "slow"];
const REQUIRED_WALL: readonly WallRole[] = [
  "phone",
  "second_face",
  "look_away_3x",
  "look_away_once",
  "tab_blocked",
  "face_missing",
  "camera_lost",
  "offline",
  "early_submit",
  "early_submit",
];

export interface CastOptions {
  /** How many students to simulate. */
  count: number;
  /** Student numbers never simulated (real laptops). */
  skipNumbers: ReadonlySet<string>;
  /** Student ids that already have a session the simulator does not own. */
  takenStudentIds: ReadonlySet<string>;
  seed: number;
  /** How many of HELP_PARTS to play, in order (default all of them). */
  helpRequests?: number;
}

export interface Cast {
  members: CastMember[];
  /** Roster entries left out (not joined in the lobby). */
  notJoined: RosterEntry[];
}

/** "Dias Kenzhebekov" -> "Dias K.", "Dana Zhaksylykova" -> "Dana Zh." as on the wall. */
export function shortName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  if (last === "") return first;
  const digraph = /^(Zh|Sh|Ch|Kh)/.exec(last);
  return `${first} ${digraph ? digraph[1] : last.charAt(0)}.`;
}

/** Picks `count` students and gives each a lobby and a wall part. Deterministic for a seed. */
export function planCast(roster: readonly RosterEntry[], options: CastOptions): Cast {
  const rng = createRng(options.seed).fork("cast");
  const eligible = roster.filter(
    (entry) => !options.skipNumbers.has(entry.number) && !options.takenStudentIds.has(entry.studentId),
  );
  const rank = (entry: RosterEntry): number => {
    const part = NAMED_PARTS[entry.number];
    if (part?.lobby === "late") return 3;
    if (part !== undefined) return 0;
    if (WALL_NAMES.includes(entry.number)) return 1;
    return 2;
  };
  const ordered = [...eligible].sort((a, b) => rank(a) - rank(b) || (a.seat ?? 1e9) - (b.seat ?? 1e9));
  const chosen = ordered.slice(0, Math.max(0, Math.min(options.count, ordered.length)));
  const chosenIds = new Set(chosen.map((entry) => entry.studentId));

  const members: CastMember[] = chosen.map((entry) => {
    const part = NAMED_PARTS[entry.number] ?? {};
    return {
      ...entry,
      lobby: part.lobby ?? "normal",
      wall: part.wall ?? "normal",
      os: part.os ?? (rng.chance(0.6) ? "macos" : "windows"),
      short: shortName(entry.name),
    };
  });

  // Hand every required part nobody plays yet to the next generic student, in seat order.
  const bySeat = [...members].sort((a, b) => (a.seat ?? 1e9) - (b.seat ?? 1e9));
  // The two students who ask for help keep a calm tile, as 2.4d draws them.
  const generic = (taken: (m: CastMember) => boolean) =>
    bySeat.find((m) => NAMED_PARTS[m.number] === undefined && !HELP_NUMBERS.has(m.number) && !taken(m));
  const lobbyNeeded = [...REQUIRED_LOBBY];
  for (const member of members) {
    const index = lobbyNeeded.indexOf(member.lobby);
    if (index >= 0) lobbyNeeded.splice(index, 1);
  }
  for (const role of lobbyNeeded) {
    const member = generic((m) => m.lobby !== "normal");
    if (member) member.lobby = role;
  }
  const wallNeeded = [...REQUIRED_WALL];
  for (const member of members) {
    const index = wallNeeded.indexOf(member.wall);
    if (index >= 0) wallNeeded.splice(index, 1);
  }
  for (const role of wallNeeded) {
    // Prefer students with a calm lobby part, so one person does not carry two story lines.
    const member =
      generic((m) => m.wall !== "normal" || m.lobby !== "normal") ?? generic((m) => m.wall !== "normal");
    if (member) member.wall = role;
  }

  for (const part of HELP_PARTS.slice(0, options.helpRequests ?? HELP_PARTS.length)) {
    const member =
      members.find((m) => m.number === part.number && m.help === undefined) ??
      generic((m) => m.wall !== "normal" || m.lobby !== "normal" || m.help !== undefined);
    if (member) member.help = { atSimMs: part.atSimMs, topic: part.topic, text: part.text };
  }

  return {
    members: bySeat,
    notJoined: roster.filter((entry) => !chosenIds.has(entry.studentId)),
  };
}

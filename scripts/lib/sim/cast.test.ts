import { describe, expect, it } from "vitest";
import { planCast, shortName, WALL_ROLES } from "./cast.ts";
import { seedRoster } from "./fixtures.ts";

const roster = seedRoster();
const defaults = { skipNumbers: new Set(["20231187"]), takenStudentIds: new Set<string>(), seed: 1 };

describe("planCast", () => {
  const cast = planCast(roster, { ...defaults, count: 120 });
  const byNumber = new Map(cast.members.map((m) => [m.number, m]));

  it("simulates 120 of 128, leaving Madina for the real MacBook and Yerlan not joined (1.5)", () => {
    expect(cast.members).toHaveLength(120);
    expect(byNumber.has("20231187")).toBe(false);
    expect(byNumber.has("20230877")).toBe(false);
    expect(cast.notJoined).toHaveLength(8);
    expect(cast.notJoined.map((entry) => entry.number)).toContain("20231187");
    expect(new Set(cast.members.map((m) => m.studentId)).size).toBe(120);
  });

  it("gives the named students their Figma parts", () => {
    expect(byNumber.get("20231044")).toMatchObject({
      lobby: "help_identity",
      wall: "look_away_3x",
      short: "Dias K.",
    });
    expect(byNumber.get("20230912")).toMatchObject({ lobby: "help_app", wall: "second_face" });
    expect(byNumber.get("20231219")).toMatchObject({ lobby: "help_camera", wall: "look_away_once" });
    expect(byNumber.get("20231302")).toMatchObject({ lobby: "normal", wall: "face_missing" });
    expect(byNumber.get("20235030")?.wall).toBe("tab_blocked");
    expect(byNumber.get("20235035")?.wall).toBe("camera_lost");
  });

  it("plays every wall part, Madina's phone included, and exactly three need help in the lobby", () => {
    const walls = cast.members.map((m) => m.wall);
    for (const role of WALL_ROLES) {
      if (role === "normal") continue;
      expect(walls, role).toContain(role);
    }
    expect(walls.filter((role) => role === "early_submit")).toHaveLength(2);
    expect(cast.members.filter((m) => m.lobby.startsWith("help_"))).toHaveLength(3);
    expect(cast.members.filter((m) => m.lobby === "slow")).toHaveLength(2);
    // The phone goes to a generic student when Madina is skipped.
    const phone = cast.members.find((m) => m.wall === "phone");
    expect(phone?.number.startsWith("202350")).toBe(true);
  });

  it("is deterministic for a seed and lists members in seat order", () => {
    const again = planCast(roster, { ...defaults, count: 120 });
    expect(again.members.map((m) => `${m.number}:${m.os}:${m.lobby}:${m.wall}`)).toEqual(
      cast.members.map((m) => `${m.number}:${m.os}:${m.lobby}:${m.wall}`),
    );
    const seats = cast.members.map((m) => m.seat ?? 0);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
  });

  it("gives Madina the phone when no real laptop uses her number", () => {
    const withMadina = planCast(roster, { ...defaults, skipNumbers: new Set(), count: 120 });
    expect(withMadina.members.find((m) => m.number === "20231187")?.wall).toBe("phone");
  });

  it("puts the named students first in a small cast and never takes a real session's seat", () => {
    const taken = new Set([roster[4]?.studentId ?? ""]); // Arman joined from a real laptop
    const small = planCast(roster, { ...defaults, takenStudentIds: taken, count: 20 });
    expect(small.members).toHaveLength(20);
    expect(small.members.some((m) => m.number === "20230912")).toBe(false);
    expect(small.members.map((m) => m.number)).toEqual(
      expect.arrayContaining(["20231044", "20231219", "20235030"]),
    );
    // Arman's lobby part moves to a generic student.
    expect(small.members.find((m) => m.lobby === "help_app")?.number.startsWith("202350")).toBe(true);
  });

  it("caps the cast at the free roster", () => {
    expect(planCast(roster, { ...defaults, count: 500 }).members).toHaveLength(127);
  });
});

describe("shortName", () => {
  it.each([
    ["Dias Kenzhebekov", "Dias K."],
    ["Dana Zhaksylykova", "Dana Zh."],
    ["Madina Tulegenova", "Madina T."],
    ["Aliya", "Aliya"],
  ])("%s -> %s", (name, short) => {
    expect(shortName(name)).toBe(short);
  });
});

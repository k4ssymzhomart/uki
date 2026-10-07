import { parseEventData, THRESHOLDS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { decide, digitRuns, humanConfig, type IdentityObservation } from "../src/identity.ts";

const NUMBER = "20231187";

function seen(overrides: Partial<IdentityObservation> = {}): IdentityObservation {
  return { liveFaces: 1, cardFace: true, similarity: 0.71, digits: null, ...overrides };
}

const goodTry = [seen(), seen({ similarity: 0.64 }), seen({ digits: ["2023", "1187", NUMBER] })];

describe("digitRuns", () => {
  it("reads runs and joins groups split by a space, hyphen or dot", () => {
    expect(digitRuns("ID 20231187")).toEqual([NUMBER]);
    expect(digitRuns("2023 1187\n05.09.2004")).toEqual(
      expect.arrayContaining([NUMBER, "2023", "1187", "05092004", "05", "09", "2004"]),
    );
    expect(digitRuns("no digits")).toEqual([]);
    expect(digitRuns("2023  1187")).toEqual(["2023", "1187"]);
  });
});

describe("decide", () => {
  it("matches with one person, a similar face and the right number", () => {
    const verdict = decide({ observations: goodTry, studentNumber: NUMBER, tries: 1 });
    expect(verdict).toEqual({
      kind: "matched",
      score: 0.71,
      tries: 1,
      rows: { face: "ok", card: "ok", person: "ok" },
      event: { type: "identity.matched", data: { score: 0.71, tries: 1 } },
    });
    if (verdict.kind === "matched") {
      expect(parseEventData("identity.matched", verdict.event.data).success).toBe(true);
    }
  });

  it("accepts a similarity of exactly the threshold and refuses one just under", () => {
    const at = (similarity: number) =>
      decide({
        observations: [seen({ similarity, digits: [NUMBER] })],
        studentNumber: NUMBER,
        tries: 1,
      }).kind;
    expect(at(THRESHOLDS.identity.minSimilarity)).toBe("matched");
    expect(at(THRESHOLDS.identity.minSimilarity - 0.001)).toBe("retry");
  });

  it("refuses someone else's card", () => {
    const verdict = decide({
      observations: [seen({ similarity: 0.31 }), seen({ similarity: 0.35, digits: [NUMBER] })],
      studentNumber: NUMBER,
      tries: 1,
    });
    expect(verdict).toMatchObject({ kind: "retry", reasons: ["face_mismatch"], rows: { face: "fail" } });
  });

  it("refuses a second person at any moment of the try", () => {
    const verdict = decide({
      observations: [...goodTry, seen({ liveFaces: 2 })],
      studentNumber: NUMBER,
      tries: 1,
    });
    expect(verdict).toMatchObject({ kind: "retry", reasons: ["more_people"], rows: { person: "fail" } });
  });

  it("refuses a wrong or unreadable number", () => {
    const wrong = decide({
      observations: [seen({ digits: ["20231455"] })],
      studentNumber: NUMBER,
      tries: 1,
    });
    expect(wrong).toMatchObject({ reasons: ["number_mismatch"], rows: { card: "fail", face: "ok" } });
    const unreadable = decide({ observations: [seen({ digits: [] })], studentNumber: NUMBER, tries: 1 });
    expect(unreadable).toMatchObject({ reasons: ["number_unreadable"], rows: { card: "fail" } });
    const notRead = decide({ observations: [seen()], studentNumber: NUMBER, tries: 1 });
    expect(notRead).toMatchObject({ rows: { card: "pending" } });
  });

  it("names a missing card photo or a missing live face", () => {
    expect(
      decide({
        observations: [seen({ cardFace: false, similarity: null, digits: [NUMBER] })],
        studentNumber: NUMBER,
        tries: 1,
      }),
    ).toMatchObject({ reasons: ["no_card_face"] });
    expect(
      decide({
        observations: [seen({ liveFaces: 0, similarity: null, digits: [NUMBER] })],
        studentNumber: NUMBER,
        tries: 1,
      }),
    ).toMatchObject({ reasons: ["no_live_face"], rows: { person: "fail", face: "fail" } });
    expect(decide({ observations: [], studentNumber: NUMBER, tries: 1 })).toMatchObject({
      kind: "retry",
      reasons: ["no_frames"],
    });
  });

  it("asks for help on the third failed try, once, and still matches later on 1.3a", () => {
    const bad = [seen({ similarity: 0.2, digits: [NUMBER] })];
    const kinds = [1, 2, 3, 4].map((tries) => decide({ observations: bad, studentNumber: NUMBER, tries }));
    expect(kinds.map((v) => v.kind)).toEqual(["retry", "retry", "help", "help"]);
    const third = kinds[2];
    expect(third?.kind === "help" && third.event).toEqual({
      type: "student.help_requested",
      data: { topic: "identity" },
    });
    const fourth = kinds[3];
    expect(fourth?.kind === "help" && fourth.event).toBeNull();
    if (third?.kind === "help" && third.event) {
      expect(parseEventData("student.help_requested", third.event.data).success).toBe(true);
    }
    expect(decide({ observations: goodTry, studentNumber: NUMBER, tries: 5 })).toMatchObject({
      kind: "matched",
      event: { data: { tries: 5 } },
    });
  });

  it("carries only the score and the tries", () => {
    const verdict = decide({ observations: goodTry, studentNumber: NUMBER, tries: 2 });
    expect(verdict.kind === "matched" && Object.keys(verdict.event.data).sort()).toEqual(["score", "tries"]);
  });
});

describe("humanConfig", () => {
  it("loads only the face detector and description models, from the given path, without a cache", () => {
    const config = humanConfig({
      humanBase: "uki://app/resources/models/human/",
      tesseract: { workerPath: "w", corePath: "c", langPath: "l" },
    });
    expect(config).toMatchObject({
      backend: "webgl",
      modelBasePath: "uki://app/resources/models/human/",
      cacheModels: false,
      warmup: "none",
      face: {
        enabled: true,
        detector: { modelPath: "blazeface.json" },
        description: { enabled: true, modelPath: "faceres.json" },
        mesh: { enabled: false },
        iris: { enabled: false },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },
    });
  });
});

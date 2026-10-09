import { describe, expect, it } from "vitest";
import { SESSION_ID, T0 } from "../test/fixtures.ts";
import { IngestRequest } from "./api.ts";
import { BOX_DECIMALS, Box, boxFromEdges, FACE_BOXES_MAX, toBox } from "./box.ts";
import { ClientEventEnvelope, EVENT_DATA, parseEventData } from "./events.ts";
import { uuidv7 } from "./ids.ts";

const FACE = { x: 0.312, y: 0.18, width: 0.355, height: 0.47 };
const SECOND = { x: 0.74, y: 0.105, width: 0.2, height: 0.31 };
const PHONE = { x: 0.552, y: 0.43, width: 0.118, height: 0.262 };

function decimals(value: number): number {
  const text = String(value);
  return text.includes(".") ? (text.split(".")[1]?.length ?? 0) : 0;
}

describe("Box", () => {
  it("takes a box inside the frame, edges included", () => {
    expect(Box.safeParse(FACE).success).toBe(true);
    expect(Box.safeParse({ x: 0, y: 0, width: 1, height: 1 }).success).toBe(true);
    expect(Box.safeParse({ x: 0.4, y: 0.5, width: 0, height: 0 }).success).toBe(true);
  });

  it("refuses a box outside the frame, a missing or extra field, and anything but a number", () => {
    for (const bad of [
      { ...FACE, x: -0.01 },
      { ...FACE, width: 1.2 },
      { x: 0.7, y: 0.1, width: 0.4, height: 0.2 }, // reaches past the right edge
      { x: 0.1, y: 0.9, width: 0.2, height: 0.2 }, // past the bottom
      { x: 0.1, y: 0.1, width: 0.2 },
      { ...FACE, label: "phone" },
      { ...FACE, x: Number.NaN },
      { ...FACE, x: "0.3" },
      [0.3, 0.2, 0.4, 0.5],
      null,
    ]) {
      expect(Box.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("never rewrites what it checks", () => {
    const precise = { x: 0.123456, y: 0.2, width: 0.3, height: 0.4 };
    expect(Box.parse(precise)).toEqual(precise);
  });
});

describe("toBox and boxFromEdges", () => {
  it("clamp to the frame and keep BOX_DECIMALS decimals", () => {
    expect(toBox({ x: -0.1, y: 0.2, width: 0.6, height: 1.2 })).toEqual({
      x: 0,
      y: 0.2,
      width: 0.5,
      height: 0.8,
    });
    const box = toBox({ x: 0.123456, y: 0.654321, width: 0.2222222, height: 0.1111111 });
    expect(box).toEqual({ x: 0.123, y: 0.654, width: 0.223, height: 0.111 });
    for (const value of Object.values(box ?? {})) expect(decimals(value)).toBeLessThanOrEqual(BOX_DECIMALS);
  });

  it("take the edges in either order", () => {
    expect(boxFromEdges(0.7, 0.6, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, width: 0.5, height: 0.5 });
  });

  it("give null for a non-finite edge", () => {
    expect(boxFromEdges(Number.NaN, 0, 1, 1)).toBeNull();
    expect(toBox({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 1 })).toBeNull();
  });

  it("always make a box Box accepts, also where rounding could pass the edge", () => {
    // 0.3335 and 0.6665 each round up; rounded separately, x + width would be 1.001.
    expect(Box.safeParse(toBox({ x: 0.3335, y: 0.3335, width: 0.6665, height: 0.6665 })).success).toBe(true);
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 2000; i += 1) {
      const box = boxFromEdges(
        random() * 1.4 - 0.2,
        random() * 1.4 - 0.2,
        random() * 1.4 - 0.2,
        random() * 1.4 - 0.2,
      );
      expect(box).not.toBeNull();
      expect(Box.safeParse(box).success, JSON.stringify(box)).toBe(true);
    }
  });
});

describe("boxes in event data", () => {
  it("phone.detected, face.second and gaze.* take their boxes", () => {
    expect(parseEventData("phone.detected", { score: 0.74, held_ms: 412, box: PHONE }).success).toBe(true);
    expect(
      parseEventData("face.second", { duration_ms: 1000, faces: 2, boxes: [FACE, SECOND] }).success,
    ).toBe(true);
    expect(
      parseEventData("gaze.off_screen", { duration_ms: 3100, direction: "left", face_box: FACE }).success,
    ).toBe(true);
    expect(parseEventData("gaze.down", { duration_ms: 2400, face_box: FACE }).success).toBe(true);
    expect(parseEventData("gaze.on_screen", { face_box: FACE }).success).toBe(true);
  });

  it("the parsed data keeps the boxes", () => {
    const parsed = parseEventData("phone.detected", { score: 0.74, held_ms: 412, box: PHONE });
    expect(parsed.success && parsed.data).toEqual({ score: 0.74, held_ms: 412, box: PHONE });
  });

  it("every box is optional: what v0.1.2 and the simulator send still passes", () => {
    for (const [type, data] of [
      ["phone.detected", { score: 0.738, held_ms: 401 }],
      ["face.second", { duration_ms: 1200, faces: 2 }],
      ["gaze.off_screen", { duration_ms: 2400, direction: "right" }],
      ["gaze.down", { duration_ms: 7700 }],
      ["gaze.on_screen", {}],
    ] as const) {
      expect(parseEventData(type, data).success, type).toBe(true);
    }
  });

  it("refuses a bad box, a box list that is empty or too long, and a box in the wrong field", () => {
    expect(
      parseEventData("phone.detected", { score: 0.74, held_ms: 412, box: { ...PHONE, x: 1.5 } }).success,
    ).toBe(false);
    expect(parseEventData("phone.detected", { score: 0.74, held_ms: 412, box: null }).success).toBe(false);
    expect(parseEventData("face.second", { duration_ms: 1000, faces: 2, boxes: [] }).success).toBe(false);
    expect(
      parseEventData("face.second", {
        duration_ms: 1000,
        faces: 2,
        boxes: Array.from({ length: FACE_BOXES_MAX + 1 }, () => FACE),
      }).success,
    ).toBe(false);
    expect(parseEventData("face.second", { duration_ms: 1000, faces: 2, boxes: FACE }).success).toBe(false);
    expect(
      parseEventData("gaze.down", { duration_ms: 2400, face_box: { ...FACE, height: 0.9 } }).success,
    ).toBe(false);
  });

  it("only the detection events name a box", () => {
    const withBoxes = Object.entries(EVENT_DATA)
      .filter(([, schema]) =>
        /box/.test(JSON.stringify(Object.keys((schema as { shape?: object }).shape ?? {}))),
      )
      .map(([type]) => type)
      .sort();
    expect(withBoxes).toEqual([
      "face.second",
      "gaze.down",
      "gaze.off_screen",
      "gaze.on_screen",
      "phone.detected",
    ]);
  });

  it("ingest's request takes events with boxes and refuses a bad one", () => {
    const event = (data: Record<string, unknown>) => ({
      id: uuidv7(),
      session_id: SESSION_ID,
      type: "phone.detected",
      source: "app",
      at: new Date(T0).toISOString(),
      seq: 1,
      data,
      frame_count: 3,
      app_version: "0.1.3",
    });
    const good = event({ score: 0.74, held_ms: 412, box: PHONE });
    expect(ClientEventEnvelope.safeParse(good).success).toBe(true);
    const request = IngestRequest.parse({ session_id: SESSION_ID, events: [good] });
    expect(request.events[0]?.data).toEqual({ score: 0.74, held_ms: 412, box: PHONE });
    const bad = IngestRequest.safeParse({
      session_id: SESSION_ID,
      events: [event({ score: 0.74, held_ms: 412, box: { ...PHONE, width: -0.1 } })],
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["events", 0, "data", "box", "width"]);
  });
});

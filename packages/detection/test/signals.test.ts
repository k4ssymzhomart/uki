import { describe, expect, it } from "vitest";
import {
  cameraCheck,
  faceSignals,
  headAngles,
  type LandmarkerResultLike,
  landmarkBox,
  lumaStats,
  NO_FACE,
  primaryFaceIndex,
  sideLook,
  UNIFORM_MAX_STD,
} from "../src/signals.ts";

const DEG = Math.PI / 180;

/** A 4 × 4 pose: rotation about y (yaw) then x (pitch), the face 50 units in front of the camera. */
function pose(yawDeg: number, pitchDeg: number, layout: "column" | "row" = "column") {
  const cy = Math.cos(yawDeg * DEG);
  const sy = Math.sin(yawDeg * DEG);
  const cp = Math.cos(pitchDeg * DEG);
  const sp = Math.sin(pitchDeg * DEG);
  // R = Rx(-pitch) · Ry(yaw): the forward axis (third column) is (sy·cp, sp, cy·cp).
  const r = [
    [cy, 0, sy],
    [sp * sy, cp, -sp * cy],
    [-cp * sy, sp, cp * cy],
  ];
  // Re-derive the third column so it is exactly (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch).
  const forward = [sy * cp, sp, cy * cp];
  const m = [
    [r[0]?.[0] ?? 0, r[0]?.[1] ?? 0, forward[0] ?? 0, 1.5],
    [r[1]?.[0] ?? 0, r[1]?.[1] ?? 0, forward[1] ?? 0, -2],
    [r[2]?.[0] ?? 0, r[2]?.[1] ?? 0, forward[2] ?? 0, -50],
    [0, 0, 0, 1],
  ];
  const data: number[] = [];
  for (let a = 0; a < 4; a += 1) {
    for (let b = 0; b < 4; b += 1) {
      data.push(layout === "column" ? (m[b]?.[a] ?? 0) : (m[a]?.[b] ?? 0));
    }
  }
  return { rows: 4, columns: 4, data };
}

function landmarks(x: number, y: number, size: number): { x: number; y: number }[] {
  return [
    { x, y },
    { x: x + size, y: y + size },
    { x: x + size / 2, y: y + size / 3 },
  ];
}

describe("head angles from the transformation matrix", () => {
  it("reads yaw and pitch in degrees, positive towards image right and up", () => {
    expect(headAngles(pose(0, 0))).toEqual({ yawDeg: 0, pitchDeg: 0 });
    expect(headAngles(pose(30, 0)).yawDeg).toBeCloseTo(30, 1);
    expect(headAngles(pose(-40, 0)).yawDeg).toBeCloseTo(-40, 1);
    expect(headAngles(pose(0, 22)).pitchDeg).toBeCloseTo(22, 1);
    expect(headAngles(pose(0, -18)).pitchDeg).toBeCloseTo(-18, 1);
    const both = headAngles(pose(26, -16));
    expect(both.yawDeg).toBeCloseTo(26, 1);
    expect(both.pitchDeg).toBeCloseTo(-16, 1);
  });

  it("gives the same angles for a row-major matrix", () => {
    expect(headAngles(pose(33, 12, "row"))).toEqual(headAngles(pose(33, 12, "column")));
  });

  it("returns zeros for a malformed matrix", () => {
    expect(headAngles({ rows: 3, columns: 3, data: [1, 0, 0, 0, 1, 0, 0, 0, 1] })).toEqual({
      yawDeg: 0,
      pitchDeg: 0,
    });
  });
});

describe("faceSignals", () => {
  it("no face gives NO_FACE", () => {
    expect(faceSignals({ faceLandmarks: [] })).toBe(NO_FACE);
  });

  it("follows the largest face and maps the eye blendshapes", () => {
    const blend = (scores: Record<string, number>) => ({
      categories: Object.entries(scores).map(([categoryName, score]) => ({ categoryName, score })),
    });
    const result: LandmarkerResultLike = {
      faceLandmarks: [landmarks(0.1, 0.1, 0.1), landmarks(0.4, 0.3, 0.35)],
      faceBlendshapes: [
        blend({ eyeLookOutLeft: 0.9 }),
        blend({
          eyeLookOutLeft: 0.2,
          eyeLookOutRight: 0.3,
          eyeLookInLeft: 0.4,
          eyeLookInRight: 0.5,
          eyeLookDownLeft: 0.6,
          eyeLookDownRight: 0.8,
        }),
      ],
      facialTransformationMatrixes: [pose(-50, 0), pose(10, 5)],
    };
    expect(primaryFaceIndex(result)).toBe(1);
    const s = faceSignals(result);
    expect(s).toMatchObject({ faces: 2, lookOutL: 0.2, lookOutR: 0.3, lookInL: 0.4, lookInR: 0.5 });
    expect(s.lookDown).toBeCloseTo(0.7);
    expect(s.yawDeg).toBeCloseTo(10, 1);
    expect(s.pitchDeg).toBeCloseTo(5, 1);
    expect(sideLook(s)).toEqual({ left: (0.2 + 0.5) / 2, right: (0.3 + 0.4) / 2 });
  });

  it("missing blendshapes and matrices read as zero", () => {
    const s = faceSignals({ faceLandmarks: [landmarks(0.2, 0.2, 0.3)] });
    expect(s).toEqual({ ...NO_FACE, faces: 1 });
  });

  it("landmarkBox clamps to the image", () => {
    expect(
      landmarkBox([
        { x: -0.1, y: 0.2 },
        { x: 0.5, y: 1.2 },
      ]),
    ).toEqual({ x: 0, y: 0.2, width: 0.5, height: 0.8 });
    expect(landmarkBox([])).toBeNull();
  });
});

describe("the 1.2 camera row", () => {
  function frame(width: number, height: number, luma: (x: number, y: number) => number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = luma(x, y);
        const i = (y * width + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return data;
  }

  it("measures frame and face brightness", () => {
    const data = frame(10, 10, (x) => (x < 5 ? 40 : 160));
    const stats = lumaStats(data, 10, 10, { x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(stats.mean).toBeCloseTo(100, 0);
    expect(stats.boxMean).toBeCloseTo(160, 0);
    expect(stats.std).toBeCloseTo(60, 0);
  });

  it("is ready with one well-lit face in a textured frame", () => {
    const lit = lumaStats(
      frame(8, 8, (x, y) => 90 + ((x + y) % 2) * 30),
      8,
      8,
      { x: 0, y: 0, width: 1, height: 1 },
    );
    expect(cameraCheck(1, lit)).toMatchObject({ ready: true, problem: null });
    expect(cameraCheck(0, lit).problem).toBe("no_face");
    expect(cameraCheck(2, lit).problem).toBe("many_faces");
  });

  it("fails a dark face (under 70 of 255) and a covered lens", () => {
    const dark = lumaStats(
      frame(8, 8, (x) => 30 + x * 4),
      8,
      8,
      { x: 0, y: 0, width: 1, height: 1 },
    );
    expect(cameraCheck(1, dark).problem).toBe("dark");
    const covered = lumaStats(
      frame(8, 8, () => 3),
      8,
      8,
    );
    expect(covered.std).toBeLessThan(UNIFORM_MAX_STD);
    expect(cameraCheck(1, covered)).toMatchObject({ ready: false, uniform: true, problem: "covered" });
  });
});

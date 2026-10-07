// Per-frame signals from a MediaPipe Face Landmarker result, plus the pixel statistics behind the camera
// row on 1.2. Pure functions: the worker passes MediaPipe's result in, tests pass recorded fixtures.
//
// Conventions (check them on the demo laptops with the developer overlay):
// - Camera frames are not mirrored. Head yaw is positive when the face turns towards the right edge of
//   the image, which is the student's own left; pitch is positive when the face turns up.
// - `lookOutL`, `lookInL` and so on are MediaPipe's eyeLookOutLeft, eyeLookInLeft... A side look is the
//   mean of eyeLookOut on one eye and eyeLookIn on the other, so a left/right swap in the blendshape
//   names only swaps the reported direction, never whether the look counts.
import { THRESHOLDS } from "@uki/contracts";

/** What the rules engine needs from one frame. Angles in degrees, look scores from 0 to 1. */
export interface FaceSignals {
  /** Faces found, 0 to 2 (numFaces is 2). */
  faces: number;
  /** Head yaw of the primary face; 0 when there is no face. Positive: the student's left. */
  yawDeg: number;
  /** Head pitch of the primary face; 0 when there is no face. Positive: up. */
  pitchDeg: number;
  lookOutL: number;
  lookOutR: number;
  lookInL: number;
  lookInR: number;
  /** Mean of eyeLookDownLeft and eyeLookDownRight. */
  lookDown: number;
}

export const NO_FACE: FaceSignals = {
  faces: 0,
  yawDeg: 0,
  pitchDeg: 0,
  lookOutL: 0,
  lookOutR: 0,
  lookInL: 0,
  lookInR: 0,
  lookDown: 0,
};

/** A box in normalized image coordinates (0 to 1). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The parts of MediaPipe's FaceLandmarkerResult this file reads; the real result is assignable to it. */
export interface LandmarkerResultLike {
  faceLandmarks: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
  faceBlendshapes?: ReadonlyArray<{ categories: ReadonlyArray<{ categoryName: string; score: number }> }>;
  facialTransformationMatrixes?: ReadonlyArray<{ rows: number; columns: number; data: ArrayLike<number> }>;
}

const RAD_TO_DEG = 180 / Math.PI;

/** The bounding box of one face's landmarks, clamped to the image. */
export function landmarkBox(landmarks: ReadonlyArray<{ x: number; y: number }>): Box | null {
  if (landmarks.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const x = Math.max(0, Math.min(1, minX));
  const y = Math.max(0, Math.min(1, minY));
  const right = Math.max(0, Math.min(1, maxX));
  const bottom = Math.max(0, Math.min(1, maxY));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** The face the rules follow: the largest one, which is the student closest to the camera. */
export function primaryFaceIndex(result: LandmarkerResultLike): number {
  let best = -1;
  let bestArea = -1;
  result.faceLandmarks.forEach((landmarks, index) => {
    const box = landmarkBox(landmarks);
    const area = box ? box.width * box.height : 0;
    if (area > bestArea) {
      bestArea = area;
      best = index;
    }
  });
  return best;
}

/**
 * Yaw and pitch from a 4 × 4 facial transformation matrix. The face's forward axis (the canonical
 * model's +z) in camera space is the third column of the rotation. MediaPipe packs the matrix column
 * major; the layout is detected from where the translation sits (the face is tens of centimetres in
 * front of the camera, so |tz| is large), so a row-major matrix gives the same angles.
 */
export function headAngles(matrix: { rows: number; columns: number; data: ArrayLike<number> }): {
  yawDeg: number;
  pitchDeg: number;
} {
  const d = matrix.data;
  if (matrix.rows !== 4 || matrix.columns !== 4 || d.length < 16) return { yawDeg: 0, pitchDeg: 0 };
  const columnMajor = Math.abs(d[14] ?? 0) >= Math.abs(d[11] ?? 0);
  const at = (row: number, column: number): number =>
    (columnMajor ? d[column * 4 + row] : d[row * 4 + column]) ?? 0;
  const fx = at(0, 2);
  const fy = at(1, 2);
  const fz = at(2, 2);
  const yawDeg = Math.atan2(fx, fz) * RAD_TO_DEG;
  const pitchDeg = Math.atan2(fy, Math.hypot(fx, fz)) * RAD_TO_DEG;
  return { yawDeg: round(yawDeg, 2), pitchDeg: round(pitchDeg, 2) };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function blendshape(
  categories: ReadonlyArray<{ categoryName: string; score: number }> | undefined,
  name: string,
): number {
  const score = categories?.find((category) => category.categoryName === name)?.score ?? 0;
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

/** The rules engine's input for one frame. */
export function faceSignals(result: LandmarkerResultLike): FaceSignals {
  const faces = result.faceLandmarks.length;
  if (faces === 0) return NO_FACE;
  const index = primaryFaceIndex(result);
  const matrix = result.facialTransformationMatrixes?.[index];
  const { yawDeg, pitchDeg } = matrix ? headAngles(matrix) : { yawDeg: 0, pitchDeg: 0 };
  const categories = result.faceBlendshapes?.[index]?.categories;
  return {
    faces,
    yawDeg,
    pitchDeg,
    lookOutL: blendshape(categories, "eyeLookOutLeft"),
    lookOutR: blendshape(categories, "eyeLookOutRight"),
    lookInL: blendshape(categories, "eyeLookInLeft"),
    lookInR: blendshape(categories, "eyeLookInRight"),
    lookDown: (blendshape(categories, "eyeLookDownLeft") + blendshape(categories, "eyeLookDownRight")) / 2,
  };
}

/** Side-look scores: the mean of eyeLookOut on one eye and eyeLookIn on the other. */
export function sideLook(s: FaceSignals): { left: number; right: number } {
  return { left: (s.lookOutL + s.lookInR) / 2, right: (s.lookOutR + s.lookInL) / 2 };
}

// ---------------------------------------------------------------------------------------------------
// Camera row on 1.2
// ---------------------------------------------------------------------------------------------------

/**
 * A frame whose luma standard deviation is below this is uniform: a covered lens or a blank picture
 * (THRESHOLDS.systemCheck.uniformMaxStd).
 */
export const UNIFORM_MAX_STD: number = THRESHOLDS.systemCheck.uniformMaxStd;

export interface LumaStats {
  /** Mean luma of the whole frame, 0 to 255. */
  mean: number;
  /** Standard deviation of luma over the whole frame. */
  std: number;
  /** Mean luma inside `box`, or null without a box. */
  boxMean: number | null;
}

/** Rec. 601 luma statistics of an RGBA buffer, optionally also inside a normalized box. */
export function lumaStats(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  box: Box | null = null,
): LumaStats {
  const pixels = width * height;
  if (pixels <= 0 || rgba.length < pixels * 4) return { mean: 0, std: 0, boxMean: null };
  let sum = 0;
  let sumSquares = 0;
  let boxSum = 0;
  let boxCount = 0;
  const bx0 = box ? Math.floor(box.x * width) : 0;
  const by0 = box ? Math.floor(box.y * height) : 0;
  const bx1 = box ? Math.ceil((box.x + box.width) * width) : 0;
  const by1 = box ? Math.ceil((box.y + box.height) * height) : 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const luma = 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
      sum += luma;
      sumSquares += luma * luma;
      if (box && x >= bx0 && x < bx1 && y >= by0 && y < by1) {
        boxSum += luma;
        boxCount += 1;
      }
    }
  }
  const mean = sum / pixels;
  const variance = Math.max(0, sumSquares / pixels - mean * mean);
  return {
    mean: round(mean, 1),
    std: round(Math.sqrt(variance), 1),
    boxMean: boxCount > 0 ? round(boxSum / boxCount, 1) : null,
  };
}

export type CameraProblem = "no_face" | "many_faces" | "dark" | "covered";

export interface CameraCheck {
  /** Ready when exactly one face, mean face brightness 70 or more, and the frame is not uniform. */
  ready: boolean;
  faces: number;
  /** Mean face brightness (the whole frame's when there is no face), 0 to 255. */
  brightness: number;
  uniform: boolean;
  /** The first failing condition, in the order covered, no face, more faces, dark. */
  problem: CameraProblem | null;
}

/** The 1.2 camera row from one frame's face count and luma. */
export function cameraCheck(faces: number, luma: LumaStats): CameraCheck {
  const brightness = luma.boxMean ?? luma.mean;
  const uniform = luma.std < UNIFORM_MAX_STD;
  let problem: CameraProblem | null = null;
  if (uniform) problem = "covered";
  else if (faces === 0) problem = "no_face";
  else if (faces > 1) problem = "many_faces";
  else if (brightness < THRESHOLDS.systemCheck.minFaceBrightness) problem = "dark";
  return { ready: problem === null, faces, brightness, uniform, problem };
}

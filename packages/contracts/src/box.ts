// One box shape for everything detection draws or stores: the face and phone boxes the detection worker
// posts for the live overlay (packages/detection/src/protocol.ts) and the boxes events carry in `data`
// (events.ts: phone.detected `box`, face.second `boxes`, gaze.* `face_box`).
//
// A box is normalised to the camera frame the detectors saw, not to a still: x and y are its top-left
// corner, width and height its size, each from 0 to 1 of the frame's width or height (the frame is
// 640 × 480, 480 × 360 in the performance fallback). Stills are 640 × 360 centre-cropped from that
// frame, so a box drawn on a still of a 4:3 frame maps y to (y − 0.125) / 0.75 and height to
// height / 0.75.
//
// `toBox` and `boxFromEdges` are the only way detection makes a box: they clamp it to the frame and keep
// BOX_DECIMALS decimals, so a box is small in JSON and always passes `Box`. `Box` itself only checks,
// it never rewrites: `ingest` stores `data` as the client sent it, so what passes is what is stored.
import { z } from "zod";

/** Decimals a box keeps: 0.001 of the frame is 0.64 px at 640 × 480. */
export const BOX_DECIMALS = 3;

/** How far past the frame's edge x + width or y + height may reach (floating-point noise only). */
const EDGE_TOLERANCE = 1e-9;

const Unit = z.number().min(0).max(1);

/** A box normalised to the camera frame: corner and size from 0 to 1, inside the frame. */
export const Box = z
  .strictObject({ x: Unit, y: Unit, width: Unit, height: Unit })
  .refine((box) => box.x + box.width <= 1 + EDGE_TOLERANCE && box.y + box.height <= 1 + EDGE_TOLERANCE, {
    message: "the box reaches past the frame",
  });
export type Box = z.infer<typeof Box>;

/** Faces a box list may hold: the Face Landmarker tracks 2 (numFaces), with room to raise it. */
export const FACE_BOXES_MAX = 4;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  const factor = 10 ** BOX_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded; // no -0
}

/**
 * The box between two edges, in frame units, clamped to the frame and rounded to BOX_DECIMALS. The
 * edges may come in either order. Null when an edge is not a finite number.
 */
export function boxFromEdges(left: number, top: number, right: number, bottom: number): Box | null {
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  const x0 = round(clamp01(Math.min(left, right)));
  const x1 = round(clamp01(Math.max(left, right)));
  const y0 = round(clamp01(Math.min(top, bottom)));
  const y1 = round(clamp01(Math.max(top, bottom)));
  return { x: x0, y: y0, width: round(x1 - x0), height: round(y1 - y0) };
}

/** `box` clamped to the frame and rounded to BOX_DECIMALS; null when a field is not a finite number. */
export function toBox(box: { x: number; y: number; width: number; height: number }): Box | null {
  return boxFromEdges(box.x, box.y, box.x + box.width, box.y + box.height);
}

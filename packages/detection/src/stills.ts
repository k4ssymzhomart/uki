// The ONLY code in Üki that turns camera pixels into image bytes ("Privacy guarantees enforced in code").
// `stills.capture` is called only by pipeline.ts, and only for a still the rules engine requested on a
// flag; test/privacy.test.ts fails if any other source file imports this module or if the pipeline
// captures without a request. A still is a JPEG, 640 × 360 centre-cropped from the camera frame, at
// quality 0.7 (STILL in @uki/contracts), made with OffscreenCanvas in the detection worker.
import { STILL } from "@uki/contracts";

/** Anything the worker can draw: the frame's ImageBitmap in practice. */
export type StillSource = ImageBitmap | OffscreenCanvas | HTMLVideoElement | VideoFrame;

export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** The centred 16:9 rectangle of a `width` × `height` frame: 640 × 360 from 640 × 480. */
export function stillCrop(width: number, height: number): Crop {
  const aspect = STILL.width / STILL.height;
  let sw = width;
  let sh = Math.round(width / aspect);
  if (sh > height) {
    sh = height;
    sw = Math.round(height * aspect);
  }
  return { sx: Math.round((width - sw) / 2), sy: Math.round((height - sh) / 2), sw, sh };
}

function sourceSize(source: StillSource): { width: number; height: number } {
  if ("videoWidth" in source) return { width: source.videoWidth, height: source.videoHeight };
  if ("displayWidth" in source) return { width: source.displayWidth, height: source.displayHeight };
  return { width: source.width, height: source.height };
}

/** Lower qualities tried only when a still would exceed STILL.maxBytes (the bucket's size limit). */
const FALLBACK_QUALITIES = [0.5, 0.3] as const;

async function encode(canvas: OffscreenCanvas): Promise<Blob> {
  for (const quality of [STILL.quality, ...FALLBACK_QUALITIES]) {
    const blob = await canvas.convertToBlob({ type: STILL.mimeType, quality });
    if (blob.size <= STILL.maxBytes) return blob;
  }
  throw new Error("still exceeds STILL.maxBytes at every quality");
}

/**
 * Draws the frame synchronously, so the caller may close `source` as soon as this returns, then
 * encodes the JPEG.
 */
function capture(source: StillSource): Promise<Blob> {
  const { width, height } = sourceSize(source);
  if (width <= 0 || height <= 0) return Promise.reject(new Error("still source has no pixels"));
  const canvas = new OffscreenCanvas(STILL.width, STILL.height);
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("no 2d context for stills"));
  const crop = stillCrop(width, height);
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, STILL.width, STILL.height);
  return encode(canvas);
}

export const stills = { capture } as const;

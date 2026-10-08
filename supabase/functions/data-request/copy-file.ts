// The pieces of the data-request function that need no network, so the functions-unit tests run them
// under Node: which Storage objects a delete removes, and the copy file A.5b sends, with the stills'
// images in place of their storage paths.
import {
  type DataCopyPackage,
  type DataCopyStill,
  type DataRequestDeletePlan,
  EXPORT_MAX_BYTES,
} from "../_shared/contracts/index.ts";

/** A flag in the copy file: as privacy_export lists it, with each still's image instead of its path. */
export type CopyFlag = Omit<DataCopyPackage["flags"][number], "frames"> & { frames: DataCopyStill[] };
/** The file the student gets. */
export type CopyFile = Omit<DataCopyPackage, "flags"> & { flags: CopyFlag[] };

export interface BuiltCopy {
  /** The file as written to the exports bucket. */
  json: string;
  /** Its size in bytes (UTF-8). */
  bytes: number;
  /** Stills whose image is in the file. */
  stills: number;
  /** Stills listed without their image: gone from Storage, or over the size limit. */
  omitted: number;
}

const encoder = new TextEncoder();

/** Base64 of `bytes`, in chunks so a large still never overflows the argument list. */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

/** Every Storage object a delete removes: the frames' paths and whatever the student's folders hold. */
export function objectsToRemove(plan: DataRequestDeletePlan, listed: readonly string[]): string[] {
  return [...new Set([...plan.paths, ...listed])].sort();
}

/**
 * The copy file: `pkg` with each still's image from `images` (keyed by storage path), oldest first,
 * while the file stays within `maxBytes`. A still whose image is missing, or would not fit, stays
 * listed with `image_jpeg_base64: null`. Storage paths never reach the file.
 */
export function buildCopyFile(
  pkg: DataCopyPackage,
  images: ReadonlyMap<string, Uint8Array>,
  maxBytes: number = EXPORT_MAX_BYTES,
): BuiltCopy {
  const flags: CopyFlag[] = pkg.flags.map(({ frames, ...flag }) => ({
    ...flag,
    frames: frames.map(({ id, captured_at }) => ({ id, captured_at, image_jpeg_base64: null })),
  }));
  const file: CopyFile = { ...pkg, flags };
  let size = encoder.encode(JSON.stringify(file, null, 2)).length;
  let stills = 0;
  let omitted = 0;
  pkg.flags.forEach((flag, flagIndex) => {
    flag.frames.forEach((frame, frameIndex) => {
      const target = flags[flagIndex]?.frames[frameIndex];
      const image = images.get(frame.storage_path);
      if (target === undefined) return;
      if (image === undefined) {
        omitted += 1;
        return;
      }
      const encoded = toBase64(image);
      // The base64 text replaces `null` inside quotes: + its length + 2 quotes − 4 for "null".
      const grown = size + encoded.length - 2;
      if (grown > maxBytes) {
        omitted += 1;
        return;
      }
      target.image_jpeg_base64 = encoded;
      size = grown;
      stills += 1;
    });
  });
  const json = JSON.stringify(file, null, 2);
  const bytes = encoder.encode(json).length;
  if (bytes > maxBytes) throw new RangeError(`the copy is ${bytes} bytes, over ${maxBytes}`);
  return { json, bytes, stills, omitted };
}

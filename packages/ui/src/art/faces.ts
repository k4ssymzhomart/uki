// The 12 states of the Face component set (Figma 4:123), from the brand kit `faces/svg`.
// Art keeps its own colours: never recolour these with tokens.

import { type AssetModule, assetUrl } from "./asset-url.ts";
import alert from "./faces/uki-face-alert.svg";
import flag from "./faces/uki-face-flag.svg";
import happy from "./faces/uki-face-happy.svg";
import lookDown from "./faces/uki-face-look-down.svg";
import lookLeft from "./faces/uki-face-look-left.svg";
import lookRight from "./faces/uki-face-look-right.svg";
import lookUp from "./faces/uki-face-look-up.svg";
import neutral from "./faces/uki-face-neutral.svg";
import oops from "./faces/uki-face-oops.svg";
import sleeping from "./faces/uki-face-sleeping.svg";
import thinking from "./faces/uki-face-thinking.svg";
import wink from "./faces/uki-face-wink.svg";

export const FACE_STATES = [
  "neutral",
  "happy",
  "alert",
  "flag",
  "sleeping",
  "thinking",
  "oops",
  "wink",
  "look-left",
  "look-right",
  "look-up",
  "look-down",
] as const;

export type FaceState = (typeof FACE_STATES)[number];

const FACE_FILES: Record<FaceState, AssetModule> = {
  neutral,
  happy,
  alert,
  flag,
  sleeping,
  thinking,
  oops,
  wink,
  "look-left": lookLeft,
  "look-right": lookRight,
  "look-up": lookUp,
  "look-down": lookDown,
};

/** URL of one face SVG, for places that need the file itself (a tray icon, a favicon, a canvas). */
export function faceSrc(state: FaceState): string {
  return assetUrl(FACE_FILES[state]);
}

export function isFaceState(value: unknown): value is FaceState {
  return typeof value === "string" && (FACE_STATES as readonly string[]).includes(value);
}

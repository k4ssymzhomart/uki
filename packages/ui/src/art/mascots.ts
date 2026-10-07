// The 22 mascot poses (Figma 3:24), from the brand kit `mascot/svg`. Art keeps its own colours.

import { type AssetModule, assetUrl } from "./asset-url.ts";
import alert from "./mascot/uki-bean-alert.svg";
import approve from "./mascot/uki-bean-approve.svg";
import celebrating from "./mascot/uki-bean-celebrating.svg";
import graduate from "./mascot/uki-bean-graduate.svg";
import hello from "./mascot/uki-bean-hello.svg";
import idCheck from "./mascot/uki-bean-id-check.svg";
import laptop from "./mascot/uki-bean-laptop.svg";
import lock from "./mascot/uki-bean-lock.svg";
import magnifier from "./mascot/uki-bean-magnifier.svg";
import master from "./mascot/uki-bean-master.svg";
import noPhone from "./mascot/uki-bean-no-phone.svg";
import oops from "./mascot/uki-bean-oops.svg";
import peeking from "./mascot/uki-bean-peeking.svg";
import pointing from "./mascot/uki-bean-pointing.svg";
import privacy from "./mascot/uki-bean-privacy.svg";
import report from "./mascot/uki-bean-report.svg";
import shield from "./mascot/uki-bean-shield.svg";
import sign from "./mascot/uki-bean-sign.svg";
import sleeping from "./mascot/uki-bean-sleeping.svg";
import standing from "./mascot/uki-bean-standing.svg";
import thinking from "./mascot/uki-bean-thinking.svg";
import writing from "./mascot/uki-bean-writing.svg";

/** In the order of the Figma component set. */
export const MASCOT_POSES = [
  "master",
  "hello",
  "standing",
  "laptop",
  "writing",
  "id-check",
  "lock",
  "shield",
  "alert",
  "no-phone",
  "magnifier",
  "thinking",
  "report",
  "approve",
  "celebrating",
  "graduate",
  "privacy",
  "oops",
  "sleeping",
  "pointing",
  "sign",
  "peeking",
] as const;

export type MascotPose = (typeof MASCOT_POSES)[number];

const MASCOT_FILES: Record<MascotPose, AssetModule> = {
  master,
  hello,
  standing,
  laptop,
  writing,
  "id-check": idCheck,
  lock,
  shield,
  alert,
  "no-phone": noPhone,
  magnifier,
  thinking,
  report,
  approve,
  celebrating,
  graduate,
  privacy,
  oops,
  sleeping,
  pointing,
  sign,
  peeking,
};

export function mascotSrc(pose: MascotPose): string {
  return assetUrl(MASCOT_FILES[pose]);
}

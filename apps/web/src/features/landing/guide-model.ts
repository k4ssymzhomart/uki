import type { MascotPose } from "@uki/ui/art";
import type { IconName } from "@uki/ui/icons";
import { LIVE_DEMO_HREF } from "../demo/demo-model.ts";
import { SECTION, sectionHref } from "./landing-model.ts";
import type { LandingHref } from "./landing-parts.tsx";

/** A step's button: where it goes, and how strongly it is drawn. */
export type GuideAction = { href: LandingHref; variant: "primary" | "secondary"; icon: IconName };

export type GuideStep = { id: string; pose: MascotPose; action?: GuideAction };

/**
 * The jury guide's steps, in order (decided by the user on 8 October; no Figma frame). Each step is the
 * mascot in one of the kit's poses beside a speech bubble; strings are `dashboard.landing.guide.<id>.*`.
 * The second step is the Live demo (9 October): sign-in with the jury's email filled in, then the live
 * wall of DEMO-LIVE. No login is ever written in the guide; the password is on the jury's one-pager.
 */
export const GUIDE_STEPS = [
  { id: "what", pose: "shield" },
  {
    id: "signIn",
    pose: "pointing",
    action: { href: LIVE_DEMO_HREF, variant: "primary", icon: "arrow-right" },
  },
  {
    id: "app",
    pose: "laptop",
    action: { href: sectionHref(SECTION.download), variant: "secondary", icon: "download" },
  },
  {
    id: "lock",
    pose: "lock",
    action: { href: sectionHref(SECTION.download), variant: "secondary", icon: "download" },
  },
  { id: "look", pose: "magnifier" },
] as const satisfies readonly GuideStep[];

/** What to look at once signed in, the last step's points: `dashboard.landing.guide.look.<id>.*`. */
export const GUIDE_LOOK = [
  { id: "wall", icon: "layout-grid" },
  { id: "ask", icon: "hand" },
  { id: "flag", icon: "flag" },
  { id: "report", icon: "report" },
  { id: "video", icon: "cloud-off" },
] as const satisfies readonly { id: string; icon: IconName }[];

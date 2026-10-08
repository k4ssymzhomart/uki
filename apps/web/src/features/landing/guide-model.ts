import type { MascotPose } from "@uki/ui/art";
import type { IconName } from "@uki/ui/icons";
import { SECTION, sectionHref } from "./landing-model.ts";
import type { LandingHref } from "./landing-parts.tsx";

/** A step's button: where it goes, and how strongly it is drawn. */
export type GuideAction = { href: LandingHref; variant: "primary" | "secondary"; icon: IconName };

export type GuideStep = { id: string; pose: MascotPose; action?: GuideAction };

/**
 * The jury guide's steps, in order (decided by the user on 8 October; no Figma frame). Each step is the
 * mascot in one of the kit's poses beside a speech bubble; strings are `dashboard.landing.guide.<id>.*`.
 * The demo login is never on the page: the team gives it in person.
 */
export const GUIDE_STEPS = [
  { id: "what", pose: "shield" },
  { id: "signIn", pose: "pointing", action: { href: "/sign-in", variant: "primary", icon: "arrow-right" } },
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

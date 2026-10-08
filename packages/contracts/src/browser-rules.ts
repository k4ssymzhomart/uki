// `exams.browser_rules`: the rules of E.1 (99:10209) for a browser exam, stored on the exam, carried
// to the app by join_exam and to Üki Lock in `exam.state` (lock.ts). The database checks the same
// shape (public.valid_browser_rules in supabase/migrations/20261009000000_phase1.sql).
import { z } from "zod";

/**
 * The column default. The four switches turn a Lock guard and its event on or off; the last three
 * rows are fixed by Phase 0's decisions: other extensions are paused only from Phase 2, developer tools
 * are blocked only on university-managed computers, and screen sharing is detected, not blocked.
 */
export const DEFAULT_BROWSER_RULES = {
  copy_paste: true,
  print: true,
  full_screen: true,
  calculator: true,
  other_extensions: "phase2",
  devtools: "managed_only",
  screen_share: "detected",
} as const;

export const BrowserRules = z.strictObject({
  /** Block copy, cut and paste; each try is a copy.blocked event. */
  copy_paste: z.boolean(),
  /** Block printing and Save as PDF; each try is a copy.blocked event of kind print. */
  print: z.boolean(),
  /** Require full screen; leaving it is lock.fullscreen_exit, and the third exit is a flag. */
  full_screen: z.boolean(),
  /** Show the calculator (E.5b) in the Lock bar. */
  calculator: z.boolean(),
  other_extensions: z.literal("phase2"),
  devtools: z.literal("managed_only"),
  screen_share: z.literal("detected"),
});
export type BrowserRules = z.infer<typeof BrowserRules>;

/** The four rules E.1 lets the exam office switch. */
export const BROWSER_RULE_SWITCHES = ["copy_paste", "print", "full_screen", "calculator"] as const;
export type BrowserRuleSwitch = (typeof BROWSER_RULE_SWITCHES)[number];

/** What a wizard step may send: any of the four switches. */
export const BrowserRulesPatch = z.strictObject({
  copy_paste: z.boolean().optional(),
  print: z.boolean().optional(),
  full_screen: z.boolean().optional(),
  calculator: z.boolean().optional(),
});
export type BrowserRulesPatch = z.infer<typeof BrowserRulesPatch>;

/** The rules the Lock applies: the exam's own, or the defaults when an older app sends none. */
export function effectiveBrowserRules(rules: BrowserRules | null | undefined): BrowserRules {
  return rules ?? { ...DEFAULT_BROWSER_RULES };
}

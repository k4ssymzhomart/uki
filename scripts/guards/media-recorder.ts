// "No MediaRecorder anywhere in the repository" (docs/phase-0-plan.md, Privacy guarantees enforced in
// code): video never leaves the laptop, so nothing may even record it. Docs may name the rule; code,
// HTML and config may not mention the API at all, comments included.
import { type Guard, matchesAny, type Violation, violation } from "./guard.ts";

// Built from parts so this file does not trip its own check.
const API = ["Media", "Recorder"].join("");
const PATTERN = new RegExp(`\\b${API}\\b`, "g");

const SOURCE = /\.(?:[cm]?[jt]sx?|html?|vue|svelte|json|toml|ya?ml|sql)$/;
const EXEMPT = [/^docs\//, /\.md$/, /^scripts\/guards\//, /(?:^|\/)pnpm-lock\.yaml$/];

export const mediaRecorderGuard: Guard = {
  id: "no-media-recorder",
  title: `no ${API} in the repository`,
  applies: (path) => SOURCE.test(path) && !matchesAny(path, EXEMPT),
  check(path, text) {
    const found: Violation[] = [];
    for (const match of text.matchAll(PATTERN)) {
      found.push(
        violation(
          path,
          text,
          match.index,
          this.id,
          `${API} is banned: video never leaves the laptop (CLAUDE.md)`,
        ),
      );
    }
    return found;
  },
};

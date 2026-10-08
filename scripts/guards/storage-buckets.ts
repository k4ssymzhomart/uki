// "Never upload an image outside frames/" (CLAUDE.md): images go only to the private `frames` bucket.
// Phase 1 adds one more private bucket, `exports`, which takes only the JSON file of a copy request
// (docs/phase-1-plan.md, Data requests; its allowed MIME type is application/json). Fails on any
// storage.from(...) whose bucket is neither (nor FRAMES_BUCKET or EXPORTS_BUCKET), on creating another
// bucket from code or SQL, on raw Storage REST URLs for another bucket, and on another bucket in
// supabase/config.toml.
import { type Guard, maskComments, type Violation, violation } from "./guard.ts";

const BUCKET = "frames";
/** Phase 1: copy requests (A.5b), JSON only. */
const EXPORTS = "exports";
const BUCKETS: readonly string[] = [BUCKET, EXPORTS];
/** The buckets written as template interpolations, `${FRAMES_BUCKET}`, as they appear in source text. */
const INTERPOLATED = ["$", "{FRAMES_BUCKET}"].join("");
const INTERPOLATED_EXPORTS = ["$", "{EXPORTS_BUCKET}"].join("");
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const EXEMPT = [/^scripts\/guards\//, /^docs\//];

/** A bucket argument the guard accepts: the literal "frames" or the contracts' FRAMES_BUCKET. */
export function isFramesBucket(argument: string): boolean {
  const arg = argument.trim();
  return (
    /^(["'`])frames\1$/.test(arg) || /^(?:[\w$]+\.)*FRAMES_BUCKET$/.test(arg) || arg === `\`${INTERPOLATED}\``
  );
}

/** A bucket argument the guard accepts: frames, or the JSON-only exports bucket. */
export function isAllowedBucket(argument: string): boolean {
  const arg = argument.trim();
  return (
    isFramesBucket(arg) ||
    /^(["'`])exports\1$/.test(arg) ||
    /^(?:[\w$]+\.)*EXPORTS_BUCKET$/.test(arg) ||
    arg === `\`${INTERPOLATED_EXPORTS}\``
  );
}

const REST_ROUTES_WITHOUT_BUCKET = new Set([
  "list",
  "move",
  "copy",
  "info",
  "public",
  "authenticated",
  "upload",
]);

function checkCode(path: string, text: string, rule: string): Violation[] {
  const code = maskComments(text);
  const found: Violation[] = [];
  for (const match of code.matchAll(/\bstorage\s*\.\s*from\s*\(\s*([^)]*?)\s*\)/g)) {
    if (!isAllowedBucket(match[1] ?? "")) {
      found.push(
        violation(
          path,
          text,
          match.index,
          rule,
          `storage.from(${match[1]}): the only buckets are ${BUCKETS.join(", ")}`,
        ),
      );
    }
  }
  for (const match of code.matchAll(/\.\s*(?:createBucket|updateBucket)\s*\(\s*([^,)]+)/g)) {
    if (!isAllowedBucket(match[1] ?? "")) {
      found.push(violation(path, text, match.index, rule, `another bucket is created: ${match[1]?.trim()}`));
    }
  }
  for (const match of code.matchAll(/\/storage\/v1\/object\/(?:upload\/sign\/|sign\/)?([^/"'`\s?]+)/g)) {
    const segment = match[1] ?? "";
    if (REST_ROUTES_WITHOUT_BUCKET.has(segment)) continue;
    if (!BUCKETS.includes(segment) && segment !== INTERPOLATED && segment !== INTERPOLATED_EXPORTS) {
      found.push(
        violation(path, text, match.index, rule, `Storage URL for bucket "${segment}": only "${BUCKET}"`),
      );
    }
  }
  return found;
}

function checkSql(path: string, text: string, rule: string): Violation[] {
  const found: Violation[] = [];
  const sql = text.replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length));
  for (const match of sql.matchAll(/insert\s+into\s+storage\.buckets\b[^;]*?values\s*\(\s*'([^']*)'/gi)) {
    if (!BUCKETS.includes(match[1] ?? "")) {
      found.push(
        violation(path, text, match.index, rule, `storage bucket "${match[1]}": only ${BUCKETS.join(", ")}`),
      );
    }
  }
  return found;
}

function checkConfig(path: string, text: string, rule: string): Violation[] {
  const found: Violation[] = [];
  for (const match of text.matchAll(/^\s*\[storage\.buckets\.([^\]]+)\]/gm)) {
    if (!BUCKETS.includes(match[1]?.trim() ?? "")) {
      found.push(
        violation(path, text, match.index, rule, `storage bucket "${match[1]}": only ${BUCKETS.join(", ")}`),
      );
    }
  }
  return found;
}

export const storageBucketsGuard: Guard = {
  id: "frames-bucket-only",
  title: `images only to the private "${BUCKET}" bucket; JSON copies only to "${EXPORTS}"`,
  applies: (path) =>
    !EXEMPT.some((re) => re.test(path)) &&
    (CODE.test(path) || /^supabase\/migrations\/.*\.sql$/.test(path) || path === "supabase/config.toml"),
  check(path, text) {
    if (path.endsWith(".sql")) return checkSql(path, text, this.id);
    if (path.endsWith(".toml")) return checkConfig(path, text, this.id);
    return checkCode(path, text, this.id);
  },
};

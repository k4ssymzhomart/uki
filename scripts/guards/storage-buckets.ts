// "Never upload an image outside frames/" (CLAUDE.md): the only Storage bucket is the private `frames`
// bucket. Fails on any storage.from(...) whose bucket is not "frames" or FRAMES_BUCKET, on creating
// another bucket from code or SQL, on raw Storage REST upload URLs for another bucket, and on another
// bucket in supabase/config.toml.
import { type Guard, maskComments, type Violation, violation } from "./guard.ts";

const BUCKET = "frames";
/** The bucket written as a template interpolation, `${FRAMES_BUCKET}`, as it appears in source text. */
const INTERPOLATED = ["$", "{FRAMES_BUCKET}"].join("");
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const EXEMPT = [/^scripts\/guards\//, /^docs\//];

/** A bucket argument the guard accepts: the literal "frames" or the contracts' FRAMES_BUCKET. */
export function isFramesBucket(argument: string): boolean {
  const arg = argument.trim();
  return (
    /^(["'`])frames\1$/.test(arg) || /^(?:[\w$]+\.)*FRAMES_BUCKET$/.test(arg) || arg === `\`${INTERPOLATED}\``
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
    if (!isFramesBucket(match[1] ?? "")) {
      found.push(
        violation(path, text, match.index, rule, `storage.from(${match[1]}): the only bucket is "${BUCKET}"`),
      );
    }
  }
  for (const match of code.matchAll(/\.\s*(?:createBucket|updateBucket)\s*\(\s*([^,)]+)/g)) {
    if (!isFramesBucket(match[1] ?? "")) {
      found.push(violation(path, text, match.index, rule, `another bucket is created: ${match[1]?.trim()}`));
    }
  }
  for (const match of code.matchAll(/\/storage\/v1\/object\/(?:upload\/sign\/|sign\/)?([^/"'`\s?]+)/g)) {
    const segment = match[1] ?? "";
    if (REST_ROUTES_WITHOUT_BUCKET.has(segment)) continue;
    if (segment !== BUCKET && segment !== INTERPOLATED) {
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
    if (match[1] !== BUCKET) {
      found.push(violation(path, text, match.index, rule, `storage bucket "${match[1]}": only "${BUCKET}"`));
    }
  }
  return found;
}

function checkConfig(path: string, text: string, rule: string): Violation[] {
  const found: Violation[] = [];
  for (const match of text.matchAll(/^\s*\[storage\.buckets\.([^\]]+)\]/gm)) {
    if (match[1]?.trim() !== BUCKET) {
      found.push(violation(path, text, match.index, rule, `storage bucket "${match[1]}": only "${BUCKET}"`));
    }
  }
  return found;
}

export const storageBucketsGuard: Guard = {
  id: "frames-bucket-only",
  title: `uploads only to the private "${BUCKET}" bucket`,
  applies: (path) =>
    !EXEMPT.some((re) => re.test(path)) &&
    (CODE.test(path) || /^supabase\/migrations\/.*\.sql$/.test(path) || path === "supabase/config.toml"),
  check(path, text) {
    if (path.endsWith(".sql")) return checkSql(path, text, this.id);
    if (path.endsWith(".toml")) return checkConfig(path, text, this.id);
    return checkCode(path, text, this.id);
  },
};

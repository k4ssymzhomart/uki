// `sessions.status.detail`: why a student is held at a check-in step, in one small vocabulary. The app
// (and the demo simulator) send it through `ingest` `status.detail`; the lobby (1.5) reads it and shows
// the matching dashboard string. A session at a check step with a detail needs help.
//
// Wire form `<kind>:<value>`:
//   app:<name>             1.2 Other apps or Screen sharing: a blocked app is open ("Telegram is open")
//   camera:<problem>       1.2 Camera: busy (no picture: another app holds the camera, "Camera blocked
//                          by another app"), no_face, many_faces, dark, covered
//   card:retry:<n>         1.3: the card could not be read on n tries; the student tries again
//                          ("Card unreadable · retry 2 of 3")
//   card:help:<n>          1.3a: n tries failed and the student waits for the proctor's help
//   lock:not_paired        1.2 Browser lock: Üki Lock is required and not paired
//   network:slow           1.2 Network: the server replied, slower than 1,000 ms
//   network:offline        1.2 Network: the server did not reply
//   storage:low            1.2 Storage: less than 1 GB free
import { z } from "zod";
import { BlockedAppName } from "./events.ts";
import { STATUS_DETAIL_MAX } from "./session.ts";

export const STATUS_DETAIL_KINDS = ["app", "camera", "card", "lock", "network", "storage"] as const;
export type StatusDetailKind = (typeof STATUS_DETAIL_KINDS)[number];

/** The camera row's problems; `busy` is the camera giving no picture at all. */
export const CAMERA_DETAIL_PROBLEMS = ["busy", "no_face", "many_faces", "dark", "covered"] as const;
export const CameraDetailProblem = z.enum(CAMERA_DETAIL_PROBLEMS);
export type CameraDetailProblem = z.infer<typeof CameraDetailProblem>;

/** `retry` while the student still tries on 1.3, `help` on 1.3a. */
export const CARD_DETAIL_PROBLEMS = ["retry", "help"] as const;
export const CardDetailProblem = z.enum(CARD_DETAIL_PROBLEMS);
export type CardDetailProblem = z.infer<typeof CardDetailProblem>;

export const NETWORK_DETAIL_PROBLEMS = ["slow", "offline"] as const;
export const NetworkDetailProblem = z.enum(NETWORK_DETAIL_PROBLEMS);
export type NetworkDetailProblem = z.infer<typeof NetworkDetailProblem>;

/** Failed card tries; the app keeps trying on 1.3a, so more than THRESHOLDS.identity.maxTries is possible. */
export const CardTries = z.number().int().min(1).max(99);

/** An app name as the wire form carries it: trimmed, on one line. */
const DetailAppName = BlockedAppName.refine((name) => name.trim() === name && !/[\r\n]/.test(name), {
  message: "an app name is trimmed and on one line",
});

export const StatusDetail = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("app"), name: DetailAppName }),
  z.strictObject({ kind: z.literal("camera"), problem: CameraDetailProblem }),
  z.strictObject({ kind: z.literal("card"), problem: CardDetailProblem, tries: CardTries }),
  z.strictObject({ kind: z.literal("lock"), problem: z.literal("not_paired") }),
  z.strictObject({ kind: z.literal("network"), problem: NetworkDetailProblem }),
  z.strictObject({ kind: z.literal("storage"), problem: z.literal("low") }),
]);
export type StatusDetail = z.infer<typeof StatusDetail>;

/** The wire form of a detail, for `status.detail`. Throws on a detail outside the vocabulary. */
export function formatStatusDetail(detail: StatusDetail): string {
  const checked = StatusDetail.parse(detail);
  switch (checked.kind) {
    case "app":
      return `app:${checked.name}`;
    case "card":
      return `card:${checked.problem}:${checked.tries}`;
    default:
      return `${checked.kind}:${checked.problem}`;
  }
}

/** A blocked app's detail, with the name trimmed and cut to fit; null for a blank name. */
export function appDetail(name: string): StatusDetail | null {
  const trimmed = name
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return trimmed === "" ? null : { kind: "app", name: trimmed };
}

const CARD_PATTERN = /^(retry|help):(\d{1,2})$/;

/** The detail a wire form names, or null for text outside the vocabulary (shown as no detail). */
export function parseStatusDetail(text: string | null | undefined): StatusDetail | null {
  if (typeof text !== "string" || text.length > STATUS_DETAIL_MAX) return null;
  const colon = text.indexOf(":");
  if (colon <= 0) return null;
  const kind = text.slice(0, colon);
  const value = text.slice(colon + 1);
  let candidate: unknown;
  switch (kind) {
    case "app":
      candidate = { kind, name: value };
      break;
    case "card": {
      const match = CARD_PATTERN.exec(value);
      if (!match) return null;
      candidate = { kind, problem: match[1], tries: Number(match[2]) };
      break;
    }
    case "camera":
    case "lock":
    case "network":
    case "storage":
      candidate = { kind, problem: value };
      break;
    default:
      return null;
  }
  const parsed = StatusDetail.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** `status.detail` as `ingest` accepts it: a wire form of the vocabulary, at most 200 characters. */
export const StatusDetailText = z
  .string()
  .max(STATUS_DETAIL_MAX)
  .refine((text) => parseStatusDetail(text) !== null, { message: "not a status detail of status-detail.ts" });

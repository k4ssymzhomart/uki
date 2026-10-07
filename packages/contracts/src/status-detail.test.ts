import { describe, expect, it } from "vitest";
import { IngestStatus } from "./api.ts";
import { SessionStatus } from "./session.ts";
import {
  appDetail,
  formatStatusDetail,
  parseStatusDetail,
  STATUS_DETAIL_KINDS,
  StatusDetail,
  StatusDetailText,
} from "./status-detail.ts";

/** Every detail the vocabulary has, with its wire form. */
const VOCABULARY: [StatusDetail, string][] = [
  [{ kind: "app", name: "Telegram" }, "app:Telegram"],
  [{ kind: "app", name: "Microsoft Teams" }, "app:Microsoft Teams"],
  [{ kind: "camera", problem: "busy" }, "camera:busy"],
  [{ kind: "camera", problem: "no_face" }, "camera:no_face"],
  [{ kind: "camera", problem: "many_faces" }, "camera:many_faces"],
  [{ kind: "camera", problem: "dark" }, "camera:dark"],
  [{ kind: "camera", problem: "covered" }, "camera:covered"],
  [{ kind: "card", problem: "retry", tries: 2 }, "card:retry:2"],
  [{ kind: "card", problem: "help", tries: 3 }, "card:help:3"],
  [{ kind: "lock", problem: "not_paired" }, "lock:not_paired"],
  [{ kind: "network", problem: "slow" }, "network:slow"],
  [{ kind: "network", problem: "offline" }, "network:offline"],
  [{ kind: "storage", problem: "low" }, "storage:low"],
];

describe("status detail vocabulary", () => {
  it("formats and parses every detail both ways", () => {
    for (const [detail, wire] of VOCABULARY) {
      expect(formatStatusDetail(detail), wire).toBe(wire);
      expect(parseStatusDetail(wire), wire).toEqual(detail);
      expect(StatusDetailText.safeParse(wire).success, wire).toBe(true);
    }
    expect(new Set(VOCABULARY.map(([detail]) => detail.kind))).toEqual(new Set(STATUS_DETAIL_KINDS));
  });

  it("keeps an app name with a colon whole", () => {
    expect(parseStatusDetail("app:Zoom: Meetings")).toEqual({ kind: "app", name: "Zoom: Meetings" });
  });

  it("refuses text outside the vocabulary, including the old ad-hoc forms", () => {
    for (const text of [
      "",
      "Telegram",
      "help",
      "camera_blocked",
      "card_retry:2",
      "card_unreadable:2",
      "camera:blocked",
      "camera:",
      "card:retry",
      "card:retry:0",
      "card:retry:x",
      "card:unreadable:2",
      "lock:absent",
      "network",
      "storage:full",
      "app:",
      "app: Telegram",
      "app:Tele\ngram",
      `app:${"x".repeat(101)}`,
      ":busy",
      "APP:Telegram",
    ]) {
      expect(parseStatusDetail(text), JSON.stringify(text)).toBeNull();
      expect(StatusDetailText.safeParse(text).success, JSON.stringify(text)).toBe(false);
    }
    expect(parseStatusDetail(null)).toBeNull();
    expect(parseStatusDetail(undefined)).toBeNull();
  });

  it("refuses to format a detail outside the vocabulary", () => {
    expect(() => formatStatusDetail({ kind: "card", problem: "retry", tries: 0 })).toThrow();
    expect(() => formatStatusDetail({ kind: "app", name: " Telegram " })).toThrow();
    expect(StatusDetail.safeParse({ kind: "camera", problem: "busy", extra: 1 }).success).toBe(false);
  });

  it("makes an app detail from a scanned name", () => {
    expect(appDetail("  Telegram ")).toEqual({ kind: "app", name: "Telegram" });
    expect(appDetail("AnyDesk\nHelper")).toEqual({ kind: "app", name: "AnyDesk Helper" });
    expect(appDetail("   ")).toBeNull();
    const long = appDetail("x".repeat(150));
    expect(long && formatStatusDetail(long)).toBe(`app:${"x".repeat(100)}`);
  });

  it("is what ingest takes, while sessions.status reads any text", () => {
    expect(IngestStatus.safeParse({ step: "checking", detail: "camera:busy" }).success).toBe(true);
    expect(IngestStatus.safeParse({ step: "checking", detail: "camera_blocked" }).success).toBe(false);
    expect(SessionStatus.safeParse({ step: "checking", detail: "camera_blocked" }).success).toBe(true);
  });
});

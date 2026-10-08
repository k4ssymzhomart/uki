// The /try detection demo (judge mode) in Russian: before the start, every failure, and a run with the
// overlay filled in, the pause and one event of every type the rules engine sends. Each renders from
// the Russian messages with no next-intl error and no raw key.
import { screen } from "@testing-library/react";
import { type DetectionDebug, RULE_EVENT_TYPES, type RuleEvent, type RulesState } from "@uki/detection";
import ru from "@uki/i18n/messages/ru.json";
import { describe, expect, it, vi } from "vitest";
import {
  INITIAL_TRY_STATE,
  type TryProblem,
  type TryState,
  toTryEvent,
} from "../src/features/try/try-model.ts";
import { TryView } from "../src/features/try/try-view.tsx";
import { intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

type Tree = { [key: string]: string | Tree };

function t(key: string): string {
  let node: string | Tree | undefined = ru as Tree;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (typeof node !== "string") throw new Error(`no Russian message ${key}`);
  return node;
}

const DATA: Record<(typeof RULE_EVENT_TYPES)[number], Record<string, unknown>> = {
  "gaze.on_screen": {},
  "gaze.off_screen": { duration_ms: 2_400, direction: "left" },
  "gaze.down": { duration_ms: 3_100 },
  "phone.detected": { score: 0.91, held_ms: 800 },
  "face.missing": { duration_ms: 10_200 },
  "face.second": { duration_ms: 1_000, faces: 2 },
  "camera.lost": { reason: "ended" },
  "session.paused": { reason: "face_missing" },
  "session.resumed": { paused_ms: 4_000, by: "student" },
};

const DEBUG: DetectionDebug = {
  at: 12_000,
  phase: "exam",
  fps: 14.8,
  faceMs: 18.2,
  phoneMs: 31.5,
  phoneChecksPerS: 2.5,
  degraded: false,
  input: { width: 640, height: 480 },
  delegate: { face: "GPU", phone: "CPU" },
  faces: 1,
  head: { yawDeg: -4.2, pitchDeg: 3.1 },
  look: { left: 0.12, right: 0.08, down: 0.2 },
  frameClass: "on",
  phoneScore: 0.62,
  rules: null,
};

const PAUSED: RulesState = {
  mode: "app",
  at: 12_000,
  faces: 0,
  gaze: "no_face",
  look: null,
  noFaceMs: 10_200,
  twoFacesMs: null,
  phone: { hits: 0, warning: false },
  paused: { reason: "face_missing", since: 11_000 },
  cameraLost: false,
  canResume: false,
};

function running(): TryState {
  const events = RULE_EVENT_TYPES.map((type, index) =>
    toTryEvent(
      {
        id: `e${index}`,
        type,
        at: 1_000 + index * 1_000,
        data: DATA[type],
        frame_count: type === "session.paused" ? 0 : 3,
      } as RuleEvent,
      0,
    ),
  );
  return {
    ...INITIAL_TRY_STATE,
    status: { kind: "running" },
    stream: {} as MediaStream,
    debug: DEBUG,
    source: "video-frame-callback",
    elapsedMs: 12_000,
    rules: PAUSED,
    events,
    away: true,
    phone: true,
  };
}

function renderView(state: TryState) {
  return renderWithIntl(
    <TryView state={state} onStart={vi.fn()} onStop={vi.fn()} onResume={vi.fn()} />,
    null,
    "ru",
  );
}

describe("/try in Russian", () => {
  it("asks to start the camera and says nothing leaves the browser", () => {
    const { container } = renderView(INITIAL_TRY_STATE);
    expect(screen.getByRole("button", { name: t("dashboard.try.start.button") })).toBeTruthy();
    expect(screen.getByText(t("dashboard.try.band.notice"))).toBeTruthy();
    expect(screen.getByText(t("dashboard.try.privacy.title"))).toBeTruthy();
    expect(screen.getByText(t("dashboard.try.events.empty"))).toBeTruthy();
    expect(container.textContent).not.toContain("Start the demo");
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });

  it("names every failure", () => {
    for (const problem of ["denied", "missing", "busy", "unsupported", "models"] satisfies TryProblem[]) {
      const { container, unmount } = renderView({
        ...INITIAL_TRY_STATE,
        status: { kind: "failed", problem },
      });
      expect(screen.getByText(t(`dashboard.try.error.${problem}.title`))).toBeTruthy();
      expect(screen.getByText(t(`dashboard.try.error.${problem}.body`))).toBeTruthy();
      expect(intlErrors).toEqual([]);
      expect(rawKeys(container)).toEqual([]);
      unmount();
    }
  });

  it("draws a run with the overlay, the pause and every rule event", () => {
    const { container } = renderView(running());
    expect(screen.getByRole("button", { name: t("dashboard.try.stop") })).toBeTruthy();
    expect(screen.getByText(t("dashboard.try.paused.title"))).toBeTruthy();
    expect(screen.getAllByText(t("dashboard.try.cue.phone")).length).toBeGreaterThan(0);
    expect(screen.getByText("requestVideoFrameCallback")).toBeTruthy();
    expect(screen.getByText("00:12")).toBeTruthy();
    expect(screen.getByText(t("dashboard.try.event.face_second.title"))).toBeTruthy();
    expect(container.textContent).toContain("лицо GPU · телефон CPU");
    for (const type of RULE_EVENT_TYPES) expect(container.textContent).toContain(type);
    expect(container.textContent).not.toContain("Session paused");
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });
});

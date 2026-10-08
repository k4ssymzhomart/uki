import { DEFAULT_EXAM_CHECKS } from "@uki/contracts";
import { RULE_EVENT_TYPES, type RuleEvent, type RulesState } from "@uki/detection";
import en from "@uki/i18n/messages/en.json";
import ru from "@uki/i18n/messages/ru.json";
import { describe, expect, it } from "vitest";
import {
  cameraProblem,
  DEMO_CHECKS,
  detectionSupported,
  EVENT_KEYS,
  eventKind,
  facesTone,
  formatElapsed,
  INITIAL_TRY_STATE,
  isActive,
  lookTone,
  pushEvent,
  ruleTimers,
  type TryEvent,
  toTryEvent,
  tryReducer,
} from "./try-model.ts";

const event = (id: string, at = 5_000): RuleEvent => ({
  id,
  type: "phone.detected",
  at,
  data: { score: 0.91, held_ms: 800 },
  frame_count: 3,
});

const tryEvent = (id: string): TryEvent => toTryEvent(event(id), 1_000);

describe("the /try demo's model", () => {
  it("runs an app exam with the default checks", () => {
    expect(DEMO_CHECKS).toEqual(DEFAULT_EXAM_CHECKS);
  });

  it("reads getUserMedia's refusals", () => {
    const error = (name: string) => new DOMException("camera", name);
    expect(cameraProblem(error("NotAllowedError"))).toBe("denied");
    expect(cameraProblem(error("SecurityError"))).toBe("denied");
    expect(cameraProblem(error("NotFoundError"))).toBe("missing");
    expect(cameraProblem(error("OverconstrainedError"))).toBe("missing");
    expect(cameraProblem(error("NotReadableError"))).toBe("busy");
    expect(cameraProblem(new TypeError("no mediaDevices"))).toBe("unsupported");
    expect(cameraProblem("nonsense")).toBe("unsupported");
  });

  it("wants a secure page with a camera API, workers, wasm and OffscreenCanvas", () => {
    const full = {
      isSecureContext: true,
      navigator: { mediaDevices: { getUserMedia: () => undefined } },
      Worker: class {},
      WebAssembly: {},
      OffscreenCanvas: class {},
      createImageBitmap: () => undefined,
    };
    expect(detectionSupported(full)).toBe(true);
    expect(detectionSupported({ ...full, isSecureContext: false })).toBe(false);
    expect(detectionSupported({ ...full, navigator: {} })).toBe(false);
    expect(detectionSupported({ ...full, OffscreenCanvas: undefined })).toBe(false);
    expect(detectionSupported({ ...full, WebAssembly: undefined })).toBe(false);
  });

  it("has a title in English and Russian for every event the rules engine sends", () => {
    type Tree = { [key: string]: string | Tree };
    const title = (messages: Tree, key: string) =>
      ((((messages.dashboard as Tree).try as Tree).event as Tree)[key] as Tree | undefined)?.title;
    for (const type of RULE_EVENT_TYPES) {
      expect(title(en as Tree, EVENT_KEYS[type]), type).toEqual(expect.any(String));
      expect(title(ru as Tree, EVENT_KEYS[type]), type).toEqual(expect.any(String));
    }
  });

  it("draws flags in coral, the pause in yellow and the returns in moss", () => {
    expect(eventKind("phone.detected")).toBe("flag");
    expect(eventKind("face.missing")).toBe("flag");
    expect(eventKind("camera.lost")).toBe("flag");
    expect(eventKind("session.paused")).toBe("warn");
    expect(eventKind("gaze.on_screen")).toBe("ok");
    expect(eventKind("session.resumed")).toBe("ok");
    expect(lookTone("on")).toBe("ok");
    expect(lookTone("left")).toBe("warn");
    expect(lookTone("no_face")).toBe("flag");
    expect(facesTone(1)).toBe("ok");
    expect(facesTone(0)).toBe("warn");
    expect(facesTone(2)).toBe("flag");
  });

  it("dates events from the start, keeps the newest 30 and never one twice", () => {
    const first = tryEvent("a");
    expect(first).toMatchObject({ elapsedMs: 4_000, review: "flag", stills: 3, type: "phone.detected" });
    let list: TryEvent[] = [];
    for (let i = 0; i < 40; i += 1) list = pushEvent(list, tryEvent(`e${i}`));
    expect(list).toHaveLength(30);
    expect(list[0]?.id).toBe("e39");
    expect(pushEvent(list, tryEvent("e39"))).toHaveLength(30);
    expect(pushEvent(list, tryEvent("e39"))[0]?.id).toBe("e39");
  });

  it("writes the time since the start as mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(9_999)).toBe("00:09");
    expect(formatElapsed(75_000)).toBe("01:15");
    expect(formatElapsed(3_725_000)).toBe("62:05");
    expect(formatElapsed(-5)).toBe("00:00");
  });

  it("measures the rule timers against their thresholds", () => {
    expect(ruleTimers(null)).toEqual({
      look: { held: 0, limit: 2 },
      noFace: { held: 0, limit: 10 },
      twoFaces: { held: 0, limit: 1 },
      phone: { hits: 0, needed: 2 },
    });
    const state: RulesState = {
      mode: "app",
      at: 1,
      faces: 2,
      gaze: "away",
      look: { kind: "off_screen", heldMs: 1_260, crossed: false },
      noFaceMs: null,
      twoFacesMs: 420,
      phone: { hits: 1, warning: false },
      paused: null,
      cameraLost: false,
      canResume: false,
    };
    expect(ruleTimers(state)).toMatchObject({
      look: { held: 1.3 },
      twoFaces: { held: 0.4 },
      phone: { hits: 1 },
    });
  });
});

describe("tryReducer", () => {
  it("starts afresh, keeps the events after a failure and clears everything else", () => {
    let state = tryReducer(INITIAL_TRY_STATE, { type: "start" });
    expect(state.status).toEqual({ kind: "camera" });
    expect(isActive(state.status)).toBe(true);
    state = tryReducer(state, { type: "stream", stream: {} as MediaStream });
    state = tryReducer(state, { type: "event", event: tryEvent("a") });
    state = tryReducer(state, { type: "cue", cue: "phone", on: true });
    expect(state.phone).toBe(true);
    state = tryReducer(state, { type: "cue", cue: "away", on: true });
    expect(state.away).toBe(true);
    const failed = tryReducer(state, { type: "status", status: { kind: "failed", problem: "models" } });
    expect(failed).toMatchObject({ stream: null, phone: false, away: false, events: [{ id: "a" }] });
    expect(isActive(failed.status)).toBe(false);
    const idle = tryReducer(state, { type: "status", status: { kind: "idle" } });
    expect(idle).toMatchObject({ status: { kind: "idle" }, stream: null, events: [{ id: "a" }] });
    expect(tryReducer(idle, { type: "start" }).events).toEqual([]);
  });
});

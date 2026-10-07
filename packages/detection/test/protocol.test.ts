import { ClientEventEnvelope, uuidv7 } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import { toEnvelope } from "../src/envelope.ts";
import { MainToWorker, WorkerToMain } from "../src/protocol.ts";
import type { RuleEvent } from "../src/rules.ts";
import { installModuleImport } from "../src/vision.ts";
import { fakeBitmap } from "./support/fake-pipeline.ts";

const models = {
  wasmBase: "uki://app/resources/models/wasm",
  faceLandmarker: "uki://app/resources/models/face_landmarker.task",
  objectDetector: "uki://app/resources/models/efficientdet_lite0.tflite",
};

describe("renderer to worker messages", () => {
  it("init fills exams.checks and delegate defaults", () => {
    const parsed = MainToWorker.parse({ type: "init", checks: { gaze_s: 3 }, mode: "app", models });
    expect(parsed).toEqual({
      type: "init",
      checks: { gaze_s: 3, phone_score: 0.85, face_missing_s: 10, identity: true, lock: true },
      mode: "app",
      models,
      delegate: { face: "GPU", phone: "CPU" },
      debug: false,
    });
  });

  it("frames carry the transferred bitmap itself", () => {
    const bitmap = fakeBitmap(null);
    const parsed = MainToWorker.parse({ type: "frame", at: 1, bitmap });
    expect(parsed.type === "frame" && parsed.bitmap).toBe(bitmap);
    expect(MainToWorker.safeParse({ type: "frame", at: 1, bitmap: {} }).success).toBe(false);
  });

  it("refuses unknown messages, extra keys and bad values", () => {
    expect(MainToWorker.safeParse({ type: "record" }).success).toBe(false);
    expect(MainToWorker.safeParse({ type: "phase", at: 1, phase: "exam", extra: 1 }).success).toBe(false);
    expect(
      MainToWorker.safeParse({ type: "camera", at: 1, state: "lost", reason: "unplugged" }).success,
    ).toBe(false);
    expect(MainToWorker.safeParse({ type: "camera", at: 1, state: "ok" }).success).toBe(true);
  });
});

describe("worker to renderer messages", () => {
  it("checks each event's data against EVENT_DATA", () => {
    const event = { id: "e1", type: "gaze.off_screen", at: 1, frame_count: 3 };
    const ok = {
      type: "outputs",
      outputs: [{ kind: "event", event: { ...event, data: { duration_ms: 2500, direction: "left" } } }],
    };
    const bad = {
      type: "outputs",
      outputs: [{ kind: "event", event: { ...event, data: { duration_ms: 2500 } } }],
    };
    expect(WorkerToMain.safeParse(ok).success).toBe(true);
    expect(WorkerToMain.safeParse(bad).success).toBe(false);
    const notRules = { ...event, type: "tab.blocked", data: { app: null } };
    expect(
      WorkerToMain.safeParse({ type: "outputs", outputs: [{ kind: "event", event: notRules }] }).success,
    ).toBe(false);
  });

  it("stills are JPEG blobs with an index from 0 to 2", () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    expect(WorkerToMain.safeParse({ type: "still", eventId: "e", index: 2, at: 5, blob }).success).toBe(true);
    expect(WorkerToMain.safeParse({ type: "still", eventId: "e", index: 3, at: 5, blob }).success).toBe(
      false,
    );
    expect(WorkerToMain.safeParse({ type: "still", eventId: "e", index: 0, at: 5, blob: "x" }).success).toBe(
      false,
    );
  });
});

describe("toEnvelope", () => {
  it("makes the envelope ingest accepts", () => {
    const event: RuleEvent = {
      id: uuidv7(),
      type: "phone.detected",
      at: Date.UTC(2026, 9, 7, 10, 0, 0, 250),
      data: { score: 0.93, held_ms: 412 },
      frame_count: 3,
    };
    const envelope = toEnvelope(event, { session_id: uuidv7(), seq: 7, app_version: "0.1.0" });
    expect(envelope).toMatchObject({ source: "app", at: "2026-10-07T10:00:00.250Z", seq: 7, frame_count: 3 });
    expect(ClientEventEnvelope.safeParse(envelope).success).toBe(true);
    expect(() =>
      toEnvelope({ ...event, id: "not-a-uuid" }, { session_id: uuidv7(), seq: 1, app_version: "x" }),
    ).toThrow();
  });
});

describe("loading the tasks-vision wasm loader in a module worker", () => {
  it("puts ModuleFactory back on every load, also when the module comes from the import cache", async () => {
    const factory = vi.fn();
    const cached = { default: factory };
    const load = vi.fn(async () => cached);
    const scope: { import?: (url: string) => Promise<void>; ModuleFactory?: unknown } = {};
    installModuleImport(scope, load);
    await scope.import?.("uki://app/resources/models/wasm/vision_wasm_module_internal.js");
    expect(scope.ModuleFactory).toBe(factory);
    scope.ModuleFactory = undefined; // what tasks-vision does after creating a task
    await scope.import?.("uki://app/resources/models/wasm/vision_wasm_module_internal.js");
    expect(scope.ModuleFactory).toBe(factory);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("fails clearly for a loader without a default export", async () => {
    const scope: { import?: (url: string) => Promise<void>; ModuleFactory?: unknown } = {};
    installModuleImport(scope, async () => ({}));
    await expect(scope.import?.("x.js")).rejects.toThrow(/no default ModuleFactory/);
  });
});

// Phase F, A3: geometry out of the worker, no pixels. The pure pieces (head pose with roll, the face
// boxes, the phone boxes), the `geometry` message, the client's subscription, and the boxes the rules
// put into events: the boxes of the moment each event crossed its threshold, which is when its first
// still is taken.
import { Box, ClientEventEnvelope, parseEventData, uuidv7 } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import { createDetectionClient, type WorkerLike } from "../src/client.ts";
import { toEnvelope } from "../src/envelope.ts";
import { phoneDetections } from "../src/phone.ts";
import {
  type DetectionGeometry,
  PHONE_DETECTIONS_MAX,
  RuleEventSchema,
  WorkerToMain,
} from "../src/protocol.ts";
import type { DetectionSignal, RuleEvent } from "../src/rules.ts";
import { faceGeometry, headAngles, headPose, landmarkBox } from "../src/signals.ts";
import {
  eventsOf,
  FAKE_FACE_BOX,
  FAKE_PHONE_BOX,
  FAKE_SECOND_FACE_BOX,
  fakeBitmap,
  fakePipeline,
} from "./support/fake-pipeline.ts";
import { face, framesFor, loadFixture, replayFixture, startReplay } from "./support/replay.ts";
import type { FrameRow } from "./support/trace.ts";

const DEG = Math.PI / 180;

/** A 4 × 4 pose R = Ry(yaw) · Rx(−pitch) · Rz(roll), the face 50 units in front of the camera. */
function pose(yawDeg: number, pitchDeg: number, rollDeg: number, layout: "column" | "row" = "column") {
  const mul = (a: number[][], b: number[][]): number[][] =>
    a.map(
      (row) => b[0]?.map((_, j) => row.reduce((sum, value, k) => sum + value * (b[k]?.[j] ?? 0), 0)) ?? [],
    );
  const [cy, sy] = [Math.cos(yawDeg * DEG), Math.sin(yawDeg * DEG)];
  const [cx, sx] = [Math.cos(-pitchDeg * DEG), Math.sin(-pitchDeg * DEG)];
  const [cz, sz] = [Math.cos(rollDeg * DEG), Math.sin(rollDeg * DEG)];
  const ry = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rx = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const rz = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  const r = mul(mul(ry, rx), rz);
  const m = [
    [...(r[0] ?? []), 1.5],
    [...(r[1] ?? []), -2],
    [...(r[2] ?? []), -50],
    [0, 0, 0, 1],
  ];
  const data: number[] = [];
  for (let a = 0; a < 4; a += 1) {
    for (let b = 0; b < 4; b += 1) data.push(layout === "column" ? (m[b]?.[a] ?? 0) : (m[a]?.[b] ?? 0));
  }
  return { rows: 4, columns: 4, data };
}

function square(x: number, y: number, size: number): { x: number; y: number }[] {
  return [
    { x, y },
    { x: x + size, y: y + size },
    { x: x + size / 2, y: y + size / 3 },
  ];
}

describe("head pose", () => {
  it("reads roll beside yaw and pitch, in either matrix layout", () => {
    const tilted = headPose(pose(0, 0, 15));
    expect(tilted.rollDeg).toBeCloseTo(15, 1);
    expect(tilted.yawDeg).toBeCloseTo(0, 1);
    expect(tilted.pitchDeg).toBeCloseTo(0, 1);
    const all = headPose(pose(28, -12, -9));
    expect(all.yawDeg).toBeCloseTo(28, 1);
    expect(all.pitchDeg).toBeCloseTo(-12, 1);
    expect(all.rollDeg).toBeCloseTo(-9, 1);
    expect(headPose(pose(28, -12, -9, "row"))).toEqual(all);
  });

  it("leaves the rules' yaw and pitch as they were", () => {
    expect(headAngles(pose(28, -12, -9))).toEqual({
      yawDeg: headPose(pose(28, -12, -9)).yawDeg,
      pitchDeg: -12,
    });
    expect(headPose({ rows: 3, columns: 3, data: [] })).toEqual({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 });
  });
});

describe("face geometry", () => {
  it("puts the primary face first, each with its landmark box and pose", () => {
    const faces = faceGeometry({
      faceLandmarks: [square(0.05, 0.1, 0.1), square(0.4, 0.3, 0.35)],
      facialTransformationMatrixes: [pose(-50, 0, 0), pose(10, 5, 3)],
    });
    expect(faces).toHaveLength(2);
    expect(faces[0]?.box).toEqual({ x: 0.4, y: 0.3, width: 0.35, height: 0.35 });
    expect(faces[0]?.yawDeg).toBeCloseTo(10, 1);
    expect(faces[0]?.rollDeg).toBeCloseTo(3, 1);
    expect(faces[1]?.box).toEqual({ x: 0.05, y: 0.1, width: 0.1, height: 0.1 });
    expect(faces[1]?.yawDeg).toBeCloseTo(-50, 1);
    for (const geometry of faces) expect(Box.safeParse(geometry.box).success).toBe(true);
  });

  it("gives no faces for no landmarks, and zeros without a matrix", () => {
    expect(faceGeometry({ faceLandmarks: [] })).toEqual([]);
    expect(faceGeometry({ faceLandmarks: [square(0.2, 0.2, 0.3)] })).toEqual([
      { box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 }, yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
    ]);
  });

  it("the landmark box is clamped and rounded", () => {
    expect(
      landmarkBox([
        { x: -0.05, y: 0.123456 },
        { x: 0.654321, y: 1.3 },
      ]),
    ).toEqual({ x: 0, y: 0.123, width: 0.654, height: 0.877 });
  });
});

describe("phone detections", () => {
  const detection = (score: number, originX: number, originY: number, width = 80, height = 120) => ({
    categories: [{ categoryName: "cell phone", score }],
    boundingBox: { originX, originY, width, height },
  });

  it("normalises pixel boxes to the input image, best first", () => {
    const found = phoneDetections(
      { detections: [detection(0.61, 64, 48), detection(0.83, 320, 240), detection(0.55, 600, 400)] },
      640,
      480,
    );
    expect(found).toEqual([
      { box: { x: 0.5, y: 0.5, width: 0.125, height: 0.25 }, score: 0.83 },
      { box: { x: 0.1, y: 0.1, width: 0.125, height: 0.25 }, score: 0.61 },
      // Cut by the frame's edge: clamped.
      { box: { x: 0.938, y: 0.833, width: 0.062, height: 0.167 }, score: 0.55 },
    ]);
    for (const { box } of found) expect(Box.safeParse(box).success).toBe(true);
  });

  it("keeps at most PHONE_DETECTIONS_MAX, and skips other classes and detections without a box", () => {
    const many = Array.from({ length: 5 }, (_, i) => detection(0.5 + i / 10, i * 100, 0));
    expect(phoneDetections({ detections: many }, 640, 480).map((d) => d.score)).toEqual([0.9, 0.8, 0.7]);
    expect(PHONE_DETECTIONS_MAX).toBe(3);
    expect(
      phoneDetections(
        {
          detections: [
            {
              categories: [{ categoryName: "remote", score: 0.9 }],
              boundingBox: detection(0.9, 0, 0).boundingBox,
            },
            { categories: [{ categoryName: "cell phone", score: 0.9 }] },
          ],
        },
        640,
        480,
      ),
    ).toEqual([]);
    expect(phoneDetections({ detections: [detection(0.9, 0, 0)] }, 0, 0)).toEqual([]);
  });
});

describe("the geometry message", () => {
  const geometry: DetectionGeometry = {
    at: 1234,
    faces: [{ box: { ...FAKE_FACE_BOX }, yawDeg: 4.5, pitchDeg: -6, rollDeg: 1.2 }],
    phone: { at: 1200, detections: [{ box: { ...FAKE_PHONE_BOX }, score: 0.74 }] },
  };

  it("is checked with Zod", () => {
    expect(WorkerToMain.safeParse({ type: "geometry", geometry }).success).toBe(true);
    expect(WorkerToMain.safeParse({ type: "geometry", geometry: { ...geometry, phone: null } }).success).toBe(
      true,
    );
    const bad = [
      { ...geometry, faces: [{ ...geometry.faces[0], box: { x: 0.9, y: 0, width: 0.2, height: 0.1 } }] },
      { ...geometry, faces: [{ ...geometry.faces[0], rollDeg: 200 }] },
      {
        ...geometry,
        phone: { at: 1, detections: Array.from({ length: 4 }, () => geometry.phone?.detections[0]) },
      },
      { ...geometry, phone: { at: 1, detections: [{ box: FAKE_PHONE_BOX, score: 1.4 }] } },
      { ...geometry, frame: new Blob([new Uint8Array([1])]) },
      { ...geometry, landmarks: [[0.1, 0.2]] },
    ];
    for (const value of bad) {
      expect(WorkerToMain.safeParse({ type: "geometry", geometry: value }).success).toBe(false);
    }
  });

  it("goes out for every tracked frame, numbers only, with the last phone check in the exam phase", () => {
    const check = fakePipeline({ phase: "check" });
    const row = (at: number, faces: number): FrameRow => [at, "f", faces, 3, -5, 0, 0, 0, 0, 0.1];
    for (let at = 0; at < 1000; at += 67) check.pipeline.frame(fakeBitmap(row(at, 2)), at);
    const checkGeometry = check.posted.flatMap((m) => (m.type === "geometry" ? [m.geometry] : []));
    expect(checkGeometry).toHaveLength(15);
    expect(checkGeometry[0]).toEqual({
      at: 0,
      faces: [
        { box: FAKE_FACE_BOX, yawDeg: 3, pitchDeg: -5, rollDeg: 0 },
        { box: FAKE_SECOND_FACE_BOX, yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
      ],
      phone: null,
    });

    const exam = fakePipeline();
    exam.run(loadFixture("phone-lifted"));
    const frames = loadFixture("phone-lifted").signals.filter((r) => r[1] === "f").length;
    const examGeometry = exam.posted.flatMap((m) => (m.type === "geometry" ? [m.geometry] : []));
    expect(examGeometry).toHaveLength(frames);
    expect(examGeometry[0]?.phone).toEqual({ at: 0, detections: [] });
    const held = examGeometry.find((g) => (g.phone?.detections.length ?? 0) > 0);
    expect(held?.phone?.detections).toEqual([{ box: FAKE_PHONE_BOX, score: expect.any(Number) }]);
    // A frame between two checks repeats the last one, with its time.
    expect(examGeometry.some((g) => g.phone !== null && g.phone.at < g.at)).toBe(true);
    for (const message of exam.posted) {
      expect(WorkerToMain.safeParse(message).success).toBe(true);
      if (message.type !== "geometry") continue;
      const json = JSON.stringify(message);
      expect(JSON.parse(json)).toEqual(message); // plain numbers, nothing a structured clone could hide
    }

    const idle = fakePipeline({ phase: "check" });
    idle.pipeline.setPhase("idle", 0);
    idle.pipeline.frame(fakeBitmap(row(10, 1)), 10);
    expect(idle.posted.filter((m) => m.type === "geometry")).toEqual([]);
  });

  it("forgets the phone check when the exam phase ends", () => {
    const run = fakePipeline();
    run.run(loadFixture("phone-lifted"));
    run.pipeline.setPhase("check", 20_000);
    run.pipeline.frame(fakeBitmap([20_100, "f", 1, 0, -5, 0, 0, 0, 0, 0.1]), 20_100);
    const last = run.posted.filter((m) => m.type === "geometry").at(-1);
    expect(last?.type === "geometry" && last.geometry.phone).toBeNull();
  });
});

describe("the client's geometry subscription", () => {
  function worker() {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const fake: WorkerLike & { reply(message: unknown): void } = {
      postMessage: vi.fn(),
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      terminate: vi.fn(),
      reply: (message) => {
        for (const listener of listeners) listener({ data: message } as MessageEvent<unknown>);
      },
    };
    return fake;
  }
  const geometry: DetectionGeometry = {
    at: 50,
    faces: [{ box: { ...FAKE_FACE_BOX }, yawDeg: 0, pitchDeg: -5, rollDeg: 0 }],
    phone: null,
  };

  it("calls every listener with each frame's geometry until it unsubscribes", () => {
    const fake = worker();
    const onError = vi.fn();
    const client = createDetectionClient(fake, { onError });
    expect(client.geometry).toBeNull();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = client.onGeometry(first);
    client.onGeometry(second);
    fake.reply({ type: "geometry", geometry });
    expect(first).toHaveBeenCalledWith(geometry);
    expect(second).toHaveBeenCalledWith(geometry);
    expect(client.geometry).toEqual(geometry);
    stopFirst();
    fake.reply({ type: "geometry", geometry: { ...geometry, at: 117 } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("drops malformed geometry, and stops everything on dispose", () => {
    const fake = worker();
    const onError = vi.fn();
    const client = createDetectionClient(fake, { onError });
    const listener = vi.fn();
    client.onGeometry(listener);
    fake.reply({ type: "geometry", geometry: { ...geometry, faces: [{ box: { x: 2 } }] } });
    expect(listener).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ stage: "message" }));
    fake.reply({ type: "geometry", geometry });
    client.dispose();
    expect(client.geometry).toBeNull();
    fake.reply({ type: "geometry", geometry });
    expect(listener).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    client.onGeometry(late)();
    expect(late).not.toHaveBeenCalled();
  });
});

describe("boxes in rule events", () => {
  /** A box that moves 0.01 to the right every 100 ms, so each moment has its own box. */
  const moving = (at: number, y = 0.2) => ({ x: Math.round(at / 100) / 100, y, width: 0.3, height: 0.4 });

  it("gaze.off_screen and gaze.on_screen carry the face box of their own moment", () => {
    const replay = startReplay();
    const withBox = (signal: DetectionSignal, at: number): DetectionSignal =>
      signal.kind === "frame" ? { ...signal, boxes: [moving(at)] } : signal;
    let at = framesFor(replay, 0, 1000, (t) => withBox(face(), t));
    at = framesFor(replay, at, 4000, (t) => withBox(face({ yawDeg: 40 }), t));
    framesFor(replay, at, 6000, (t) => withBox(face(), t));
    const off = replay.events.find((e) => e.type === "gaze.off_screen");
    const back = replay.events.find((e) => e.type === "gaze.on_screen");
    expect(off?.type === "gaze.off_screen" && off.data.face_box).toEqual(moving(off?.at ?? -1));
    expect(back?.type === "gaze.on_screen" && back.data.face_box).toEqual(moving(back?.at ?? -1));
    for (const event of replay.events) expect(RuleEventSchema.safeParse(event).success).toBe(true);
  });

  it("gaze.down carries the face box of its crossing", () => {
    const replay = startReplay();
    let at = framesFor(replay, 0, 1000, (t) => ({ ...face(), boxes: [moving(t)] }));
    at = framesFor(replay, at, 4000, (t) => ({ ...face({ pitchDeg: -30 }), boxes: [moving(t)] }));
    framesFor(replay, at, 5000, (t) => ({ ...face(), boxes: [moving(t)] }));
    const down = replay.events.find((e) => e.type === "gaze.down");
    expect(down?.type === "gaze.down" && down.data.face_box).toEqual(moving(down?.at ?? -1));
  });

  it("face.second carries every face's box of the frame that fired it, the student's first", () => {
    const replay = startReplay();
    framesFor(replay, 0, 2000, (t) => ({ ...face({ faces: 2 }), boxes: [moving(t), moving(t, 0.5)] }));
    const second = replay.events.find((e) => e.type === "face.second");
    const at = second?.at ?? -1;
    expect(second?.type === "face.second" && second.data.boxes).toEqual([moving(at), moving(at, 0.5)]);
  });

  it("phone.detected carries the box of the check that fired it", () => {
    const replay = startReplay({ checks: { phone_score: 0.55 } });
    for (let at = 0; at <= 1600; at += 400) {
      replay.push(at, face());
      replay.push(at, { kind: "phone", score: 0.7, box: moving(at, 0.45) });
    }
    const phone = replay.events.find((e) => e.type === "phone.detected");
    expect(phone?.type === "phone.detected" && phone.data.box).toEqual(moving(phone?.at ?? -1, 0.45));
  });

  it("signals without boxes give events without them, as before", () => {
    for (const name of ["look-away-3s", "phone-lifted", "second-person"]) {
      const replay = replayFixture(loadFixture(name));
      expect(replay.events.length).toBeGreaterThan(0);
      for (const event of replay.events) {
        expect(
          Object.keys(event.data).some((key) => key.includes("box")),
          `${name} ${event.type}`,
        ).toBe(false);
      }
    }
  });
});

describe("boxes from the detectors to the envelope ingest takes", () => {
  function eventOf(name: string, type: RuleEvent["type"]): RuleEvent {
    const run = fakePipeline();
    run.run(loadFixture(name));
    const event = eventsOf(run.posted).find((e) => e.type === type);
    if (!event) throw new Error(`${name}: no ${type}`);
    return event as RuleEvent;
  }

  it("the recorded traces through the pipeline put the detectors' boxes into the events", () => {
    expect(eventOf("phone-lifted", "phone.detected").data).toMatchObject({ box: FAKE_PHONE_BOX });
    expect(eventOf("second-person", "face.second").data).toMatchObject({
      boxes: [FAKE_FACE_BOX, FAKE_SECOND_FACE_BOX],
    });
    expect(eventOf("look-away-3s", "gaze.off_screen").data).toMatchObject({ face_box: FAKE_FACE_BOX });
    expect(eventOf("look-away-3s", "gaze.on_screen").data).toEqual({ face_box: FAKE_FACE_BOX });
  });

  it("each of them makes a valid envelope with its boxes in data", () => {
    for (const [name, type] of [
      ["phone-lifted", "phone.detected"],
      ["second-person", "face.second"],
      ["look-away-3s", "gaze.off_screen"],
      ["look-away-3s", "gaze.on_screen"],
    ] as const) {
      const event = { ...eventOf(name, type), id: uuidv7() } as RuleEvent;
      expect(parseEventData(event.type, event.data).success).toBe(true);
      const envelope = toEnvelope(event, { session_id: uuidv7(), seq: 1, app_version: "0.1.3" });
      expect(ClientEventEnvelope.safeParse(envelope).success).toBe(true);
      expect(envelope.data).toEqual(event.data);
    }
  });
});

// The recorded signal traces for every Tuning moment in docs/phase-0-plan.md, built with the seeded
// trace builder. `pnpm exec tsx test/fixtures/generate.ts` writes them to test/fixtures/*.json;
// test/fixtures.test.ts fails when a JSON file no longer matches what this file builds.
import {
  createTraceBuilder,
  noPhone,
  type Pose,
  prng,
  type TraceFixture,
  writing,
} from "../support/trace.ts";

const away =
  (pose: Pose): (() => Pose) =>
  () =>
    pose;

/** Look away for 3 seconds: head turned 40° to the left, between stretches of writing. */
export function lookAway3s(): TraceFixture {
  return createTraceBuilder(11)
    .segment(5_000, writing(1))
    .segment(3_000, away({ faces: 1, yaw: 40, pitch: -4 }))
    .segment(5_000, writing(2))
    .build("look-away-3s", "Head turned 40° to the student's left for 3 s.");
}

/** Lift a phone: held upright to the camera for 3 seconds, the face stays on screen. */
export function phoneLifted(): TraceFixture {
  return createTraceBuilder(12)
    .segment(4_000, writing(3))
    .segment(3_000, writing(4), (t) => 0.91 + 0.04 * Math.sin(t / 300))
    .segment(5_000, writing(5))
    .build("phone-lifted", "A phone held up in view for 3 s, scores 0.87 to 0.95.");
}

/** Leave the seat for 10 seconds: the face rises, then is gone for 11 s, then comes back. */
export function leaveSeat(): TraceFixture {
  return createTraceBuilder(13)
    .segment(3_000, writing(6))
    .segment(400, away({ faces: 1, pitch: 28 }))
    .segment(11_000, away({ faces: 0 }))
    .segment(4_000, writing(7))
    .build("leave-seat-10s", "Stands up (head up for 400 ms), away for 11 s, back for 4 s.");
}

/** A second person behind the student for 2 seconds. */
export function secondPerson(): TraceFixture {
  return createTraceBuilder(14)
    .segment(3_000, writing(8))
    .segment(2_000, (t) => ({ ...writing(9)(t), faces: 2 }))
    .segment(3_000, writing(10))
    .build("second-person", "Two faces in view for 2 s.");
}

/** The camera is unplugged during writing: the track ends and no frame follows. */
export function cameraUnplugged(): TraceFixture {
  return createTraceBuilder(15)
    .segment(3_000, writing(11))
    .cameraLost("ended")
    .gap(5_000)
    .build("camera-unplugged", "The camera track ends after 3 s of writing.");
}

/**
 * Five minutes of normal writing. Besides drift and blinks it holds the noise that must never flag: a
 * glance to the side every ~45 s (700 ms), a look at the keyboard every ~60 s (1.2 s), a single false
 * phone hit every ~90 s, a single false second face every ~70 s and a 200 ms face dropout every ~100 s.
 */
export function normalWriting5min(): TraceFixture {
  const random = prng(99);
  const base = writing(12);
  const glanceAt = new Set<number>();
  for (let t = 20_000; t < 300_000; t += 40_000 + Math.floor(random() * 10_000)) glanceAt.add(t);
  const keyboardAt = new Set<number>();
  for (let t = 33_000; t < 300_000; t += 55_000 + Math.floor(random() * 10_000)) keyboardAt.add(t);
  const within = (set: Set<number>, t: number, ms: number): boolean => {
    for (const start of set) if (t >= start && t < start + ms) return true;
    return false;
  };
  const pose = (t: number): Pose => {
    if (within(glanceAt, t, 700)) return { faces: 1, yaw: -33, pitch: -5 };
    if (within(keyboardAt, t, 1_200)) return { faces: 1, yaw: 2, pitch: -24, lookDown: 0.7 };
    if (t % 100_000 >= 50_000 && t % 100_000 < 50_200) return { faces: 0 };
    if (t % 70_000 >= 35_000 && t % 70_000 < 35_067) return { ...base(t), faces: 2 };
    return base(t);
  };
  const phone = (t: number): number => (t % 90_000 >= 45_000 && t % 90_000 < 45_400 ? 0.87 : noPhone());
  return createTraceBuilder(16)
    .segment(300_000, pose, phone)
    .build(
      "normal-writing-5min",
      "5 minutes at the screen with blinks, short glances, keyboard looks and detector noise.",
    );
}

export const TRACES = {
  "look-away-3s": lookAway3s,
  "phone-lifted": phoneLifted,
  "leave-seat-10s": leaveSeat,
  "second-person": secondPerson,
  "camera-unplugged": cameraUnplugged,
  "normal-writing-5min": normalWriting5min,
} as const;
export type TraceName = keyof typeof TRACES;

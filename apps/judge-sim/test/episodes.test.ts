import { ClientEventEnvelope, REVIEW, uuidv7 } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import {
  type EpisodeContext,
  type EpisodeKind,
  INCIDENT_KINDS,
  planCost,
  planEpisode,
  stepCost,
} from "../src/episodes.ts";
import { createRng } from "../src/rng.ts";

const ctx: EpisodeContext = {
  gazeS: 2,
  faceMissingS: 10,
  locale: "kk",
  next: { id: "0192a6e0-0000-7000-8000-0000000000a1", position: 20, choiceIds: ["a", "b", "c", "d"] },
  questionCount: 20,
};
const ALL: EpisodeKind[] = [...INCIDENT_KINDS, "answer", "ask_proctor"];
const SESSION = "0192a6e0-0000-7000-8000-0000000000b1";

describe("episodes", () => {
  it.each(ALL)("%s sends events the contracts accept from the app", (kind) => {
    const rng = createRng(kind);
    for (let draw = 0; draw < 20; draw += 1) {
      const plan = planEpisode(kind, rng, ctx);
      expect(plan.steps.length).toBeGreaterThan(0);
      let seq = 0;
      for (const step of plan.steps) {
        for (const event of step.events) {
          seq += 1;
          const parsed = ClientEventEnvelope.safeParse({
            id: uuidv7(),
            session_id: SESSION,
            type: event.type,
            source: "app",
            at: new Date(Date.now() + event.offsetMs).toISOString(),
            seq,
            data: event.data,
            frame_count: event.stills.length,
            app_version: "0.1.0-judge-sim",
          });
          expect(parsed.success, `${kind}: ${event.type} ${JSON.stringify(event.data)}`).toBe(true);
          expect(event.offsetMs).toBeLessThanOrEqual(0);
          // Stills only on flags, at most 3 (STILL.maxCount), as the app sends them.
          if (event.stills.length > 0) expect(REVIEW[event.type]).toBe("flag");
          expect(event.stills.length).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("plays the moments the task lists", () => {
    const rng = createRng(1);
    const data = (kind: EpisodeKind) => planEpisode(kind, rng, ctx).steps[0]?.events[0]?.data ?? {};
    expect((data("phone_hand") as { score: number }).score).toBeLessThan(0.95);
    expect((data("phone_raised") as { score: number }).score).toBeGreaterThanOrEqual(0.95);
    expect(planEpisode("look_down", rng, ctx).steps[0]?.events.map((e) => e.type)).toEqual([
      "gaze.down",
      "gaze.on_screen",
    ]);
    expect(data("glance_left")).toMatchObject({ direction: "left" });
    expect(data("glance_right")).toMatchObject({ direction: "right" });
    expect(data("second_face")).toMatchObject({ faces: 2 });
    expect(data("app_switch")).toEqual({ app: null });
    expect(data("forbidden_app")).toEqual({ app: "Telegram" });
    expect(["question", "technical", "break"]).toContain((data("ask_proctor") as { topic: string }).topic);
  });

  it("an empty seat pauses, then comes back 20 to 60 s later", () => {
    const rng = createRng(2);
    for (let i = 0; i < 50; i += 1) {
      const plan = planEpisode("absent", rng, ctx);
      expect(plan.steps.map((s) => s.events.map((e) => e.type))).toEqual([
        ["face.missing", "session.paused"],
        ["session.resumed"],
      ]);
      const back = plan.steps[1];
      expect(back?.afterMs).toBeGreaterThanOrEqual(20_000);
      expect(back?.afterMs).toBeLessThanOrEqual(60_000);
      expect(back?.events[0]?.data).toEqual({ paused_ms: back?.afterMs, by: "student" });
    }
  });

  it("a look away is sent when it ends, with at at the threshold crossing", () => {
    const plan = planEpisode("look_down", createRng(3), ctx);
    const [down, back] = plan.steps[0]?.events ?? [];
    const duration = Number(down?.data.duration_ms);
    expect(down?.offsetMs).toBe(-duration + 2000 - 300);
    expect(back?.offsetMs).toBe(0);
  });

  it("an answer saves the next question and moves the status on, back to 1 after the last", () => {
    const plan = planEpisode("answer", createRng(4), ctx);
    const step = plan.steps[0];
    expect(step?.answer?.questionId).toBe(ctx.next?.id);
    expect(["a", "b", "c", "d"]).toContain(step?.answer?.choiceId);
    expect(step?.status).toEqual({ question: 1 });
    expect(step?.events[0]?.data).toEqual({ question_id: ctx.next?.id });
    const middle = planEpisode("answer", createRng(4), {
      ...ctx,
      next: { id: "0192a6e0-0000-7000-8000-0000000000a7", position: 7, choiceIds: ["a"] },
    });
    expect(middle.steps[0]?.status).toEqual({ question: 8 });
    expect(planEpisode("answer", createRng(4), { ...ctx, next: null }).steps).toEqual([]);
  });

  it("counts what each step costs on the server", () => {
    const rng = createRng(5);
    expect(planCost(planEpisode("phone_hand", rng, ctx))).toEqual({
      broadcasts: 3,
      invocations: 2,
      stills: 1,
    });
    expect(planCost(planEpisode("absent", rng, ctx))).toEqual({ broadcasts: 8, invocations: 3, stills: 1 });
    expect(planCost(planEpisode("ask_proctor", rng, ctx))).toEqual({
      broadcasts: 3,
      invocations: 1,
      stills: 0,
    });
    expect(stepCost({ afterMs: 0, events: [] })).toEqual({ broadcasts: 1, invocations: 1, stills: 0 });
  });
});

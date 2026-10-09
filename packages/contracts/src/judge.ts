// Judge mode (docs/runbooks/judge-mode.md): the always-live exam "Demo · Live" (DEMO-LIVE), its roster,
// the read-only judge account, and the shapes of the calls the simulator, the setup script, the
// dashboard's simulator indicator and the demo-live-purge function make
// (supabase/migrations/20261013130100_judge_mode.sql).
import { z } from "zod";
import { Timestamp, Uuid } from "./primitives.ts";
import { ExamStatus, SessionState } from "./session.ts";

/** The always-live exam: an app exam in the KRU workspace. */
export const DEMO_LIVE_CODE = "DEMO-LIVE";
export const DEMO_LIVE_TITLE = "Demo · Live";
/** Its own group, with the 30 demo students. */
export const DEMO_GROUP_CODE = "DEMO";
/** Each run lasts 720 minutes; demo_live_tick rolls it over with less than 30 left. */
export const DEMO_LIVE_DURATION_MIN = 720;
export const DEMO_LIVE_ROLLOVER_MIN = 30;

/** The roster: 20249001 to 20249030. */
export const DEMO_FIRST_NUMBER = 20249001;
export const DEMO_ROSTER_SIZE = 30;
export function demoStudentNumbers(count: number = DEMO_ROSTER_SIZE): string[] {
  return Array.from({ length: Math.max(0, Math.min(count, DEMO_ROSTER_SIZE)) }, (_, i) =>
    String(DEMO_FIRST_NUMBER + i),
  );
}

/**
 * DEMO-LIVE's own checks (finals brief, B1): no Üki Lock and no card check, so a person with the real app
 * joins with the code and a student ID alone, and phones flag at 0.55, the value the live test of
 * 9 October chose. `pnpm judge:setup` merges them into the exam's checks and keeps every other key.
 */
export const DEMO_LIVE_CHECKS = { lock: false, identity: false, phone_score: 0.55 } as const;

/** The roster numbers left to people with the real app (the simulator plays 20249001 to 20249024). */
export const DEMO_REAL_APP_FIRST = 20249026;
export function demoRealAppNumbers(): string[] {
  return demoStudentNumbers().filter((number) => Number(number) >= DEMO_REAL_APP_FIRST);
}

/** The audit action `pnpm judge:free-seat` writes when it frees a DEMO-LIVE seat. */
export const DEMO_LIVE_FREE_SEAT_ACTION = "demo_live.free_seat";

/** The read-only staff account judges sign in with (role observer, assigned to DEMO-LIVE only). */
export const JUDGE_EMAIL = "judge@kru.test";

/** The dashboard's "Simulator: live" turns "stopped" when no session was seen for this long. */
export const SIMULATOR_STOPPED_AFTER_MS = 60_000;
/** How often an open DEMO-LIVE wall calls demo_live_seen; demo_live_status counts a wall for 90 s. */
export const DEMO_LIVE_SEEN_EVERY_MS = 30_000;

/** `rpc('session_heartbeat', { session_id })`: the session owner only. */
export const SessionHeartbeatInput = z.object({ session_id: Uuid });
export type SessionHeartbeatInput = z.infer<typeof SessionHeartbeatInput>;

export const SessionHeartbeatOutput = z.object({
  state: SessionState,
  last_seen_at: Timestamp,
  ends_at: Timestamp,
  server_time: Timestamp,
});
export type SessionHeartbeatOutput = z.infer<typeof SessionHeartbeatOutput>;

/** `rpc('demo_live_status')`: DEMO-LIVE's timing (null without the exam) and the open walls. */
export const DemoLiveStatus = z.object({
  exam: z
    .object({
      id: Uuid,
      status: ExamStatus,
      starts_at: Timestamp,
      ends_at: Timestamp,
    })
    .nullable(),
  viewers: z.number().int().nonnegative(),
  server_time: Timestamp,
});
export type DemoLiveStatus = z.infer<typeof DemoLiveStatus>;

/** `rpc('demo_live_seen', { exam_id })`: the open wall says so; the reply carries the exam's timing. */
export const DemoLiveSeenInput = z.object({ exam_id: Uuid });
export type DemoLiveSeenInput = z.infer<typeof DemoLiveSeenInput>;

export const DemoLiveSeenOutput = z.object({
  starts_at: Timestamp,
  duration_min: z.number().int().positive(),
  status: ExamStatus,
});
export type DemoLiveSeenOutput = z.infer<typeof DemoLiveSeenOutput>;

/**
 * POST /functions/v1/demo-live-purge (secret key: pg_cron's demo_live_tick through pg_net): deletes up
 * to `limit` stills of DEMO-LIVE sessions that no longer exist (demo_live_orphans) through the Storage
 * API. `listed` is how many it found, `removed` how many Storage confirmed.
 */
export const DemoLivePurgeInput = z.object({ limit: z.number().int().min(1).max(1000).optional() });
export type DemoLivePurgeInput = z.infer<typeof DemoLivePurgeInput>;

export const DemoLivePurgeOutput = z.object({
  listed: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});
export type DemoLivePurgeOutput = z.infer<typeof DemoLivePurgeOutput>;

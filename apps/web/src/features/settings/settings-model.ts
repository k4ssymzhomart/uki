import { type ExamChecks, WorkspaceSettings } from "@uki/contracts";

/**
 * A.4 Settings (Figma 106:10905) as pure functions: the choices of each select and the change a control
 * makes to `workspaces.settings`. The plan's four settings are retention days, lobby minutes, default
 * duration and default checks; save_exam_draft reads them when it makes the next new exam. Unit-tested in
 * settings-model.test.ts.
 */

/** Keep flagged frames, in days (A.4 "90 days"; the A.5 retention rule). */
export const RETENTION_OPTIONS = [30, 60, 90, 180, 365] as const;
/** When the lobby opens before the start, in minutes. */
export const LOBBY_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
/** The new exam's duration, in minutes: the same list as 0.4's Duration. */
export const DURATION_OPTIONS = [30, 40, 45, 50, 60, 75, 90, 120, 150, 180] as const;
/** Gaze threshold, in seconds: 0.2a's Strict, Default and Calm, as on 0.2. */
export const GAZE_OPTIONS = [1, 2, 3] as const;
/** Phone confidence, as on 0.2: around the 0.55 default (docs/decisions.md, "Detection thresholds: phone_score 0.55"). */
export const PHONE_OPTIONS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.85] as const;

/** The choices of a select: the fixed list plus the current value when it is not on it, in order. */
export function withCurrent(options: readonly number[], current: number): number[] {
  if (options.includes(current)) return [...options];
  return [...options, current].sort((a, b) => a - b);
}

/**
 * One change from a control on A.4. Browser lock (`lock`) and Identity check (`identity`) are the only
 * checks `exams.checks` can switch off; gaze, phone and second person always run on the laptop, so their
 * rows are fixed, as on 0.2.
 */
export type SettingsChange =
  | { key: "retention_days" | "lobby_minutes" | "default_duration_min"; value: number }
  | { key: "gaze_s" | "phone_score"; value: number }
  | { key: "lock" | "identity"; value: boolean };

/** The settings after a change, checked against WorkspaceSettings; null when the result is not valid. */
export function applyChange(settings: WorkspaceSettings, change: SettingsChange): WorkspaceSettings | null {
  let next: WorkspaceSettings;
  switch (change.key) {
    case "retention_days":
    case "lobby_minutes":
    case "default_duration_min":
      next = { ...settings, [change.key]: change.value };
      break;
    case "gaze_s":
    case "phone_score":
    case "lock":
    case "identity": {
      const checks: ExamChecks = { ...settings.default_checks, [change.key]: change.value };
      next = { ...settings, default_checks: checks };
      break;
    }
  }
  const parsed = WorkspaceSettings.safeParse(next);
  return parsed.success ? parsed.data : null;
}

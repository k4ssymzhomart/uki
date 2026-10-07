// Steady state derived from a flow snapshot. The runtime compares each value with the last one it
// applied and calls the matching service when it changes, so a restart or a missed effect can never
// leave the window locked or the camera running by mistake.
import {
  type AppToLock,
  type ExamStatePhase,
  Host,
  type IngestStatus,
  STATUS_DETAIL_MAX,
} from "@uki/contracts";
import type { SnapshotFrom } from "xstate";
import type { studentFlowMachine } from "./machine.ts";
import { effectiveEndsAt } from "./timer.ts";
import type { FlowContext } from "./types.ts";

export type FlowSnapshot = SnapshotFrom<typeof studentFlowMachine>;

/** Where the student is, flattened from the machine's state value. */
export type FlowStage =
  | "boot"
  | "join"
  | "joining"
  | "system"
  | "identity"
  | "identityHelp"
  | "identityMatched"
  | "rules"
  | "waitingLock"
  | "writing"
  | "selfPaused"
  | "proctorPaused"
  | "submitting"
  | "ending"
  | "submitted"
  | "ended";

export function stageOf(snapshot: FlowSnapshot): FlowStage {
  if (snapshot.matches("boot")) return "boot";
  if (snapshot.matches({ join: "joining" })) return "joining";
  if (snapshot.matches("join") || snapshot.matches("routeJoined")) return "join";
  if (snapshot.matches({ checkIn: "system" })) return "system";
  if (snapshot.matches({ checkIn: { identity: "help" } })) return "identityHelp";
  if (snapshot.matches({ checkIn: { identity: "matched" } })) return "identityMatched";
  if (snapshot.matches({ checkIn: "identity" })) return "identity";
  if (snapshot.matches({ checkIn: "rules" })) return "rules";
  if (snapshot.matches({ exam: { flow: "waitingLock" } })) return "waitingLock";
  if (snapshot.matches({ exam: { flow: "selfPaused" } })) return "selfPaused";
  if (snapshot.matches({ exam: { flow: "proctorPaused" } })) return "proctorPaused";
  if (snapshot.matches("exam")) return "writing";
  if (snapshot.matches("submitting")) return "submitting";
  if (snapshot.matches("ending")) return "ending";
  if (snapshot.matches("submitted")) return "submitted";
  return "ended";
}

const IN_EXAM: readonly FlowStage[] = ["waitingLock", "writing", "selfPaused", "proctorPaused"];

export function isExamStage(stage: FlowStage): boolean {
  return IN_EXAM.includes(stage);
}

/** Lockdown (kiosk, always on top, quit blocked): app exams from 2.1 until 3.1 or 2.1d. */
export function wantsLockdown(snapshot: FlowSnapshot): boolean {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  if (context.joined?.exam.mode !== "app" || !context.exam.startedSent) return false;
  return isExamStage(stage) || stage === "submitting" || stage === "ending";
}

/**
 * Browser exams hide the window to the tray while the student writes in the browser; pause, message
 * and end bring it back with 2.1c, 2.1e or 2.1d, and 3.1 shows in it.
 */
export function wantsHidden(snapshot: FlowSnapshot): boolean {
  const { context } = snapshot;
  if (context.joined?.exam.mode !== "browser") return false;
  const stage = stageOf(snapshot);
  if (!isExamStage(stage)) return false;
  return stage !== "proctorPaused" && context.notice === null;
}

export type DetectionWant = "off" | "idle" | "check" | "exam";

/** What the camera and the detection worker should do. */
export function wantsDetection(snapshot: FlowSnapshot): DetectionWant {
  switch (stageOf(snapshot)) {
    case "boot":
    case "join":
    case "joining":
    case "submitted":
    case "ended":
      return "off";
    case "system":
      return "check";
    case "writing":
    case "selfPaused":
      return "exam";
    default:
      return "idle";
  }
}

export function wantsSystemCheck(snapshot: FlowSnapshot): boolean {
  return stageOf(snapshot) === "system";
}

/** The card match runs on 1.3 and keeps retrying on 1.3a, until it matches. */
export function wantsIdentity(snapshot: FlowSnapshot): boolean {
  const stage = stageOf(snapshot);
  return stage === "identity" || stage === "identityHelp";
}

/** The first failing 1.2 row, as a short machine-readable detail (the blocked app's name if any). */
export function checkDetail(context: FlowContext): string | undefined {
  const { checks } = context;
  if (checks.apps.status === "fail" && checks.apps.app) return checks.apps.app;
  if (checks.screenShare.status === "fail" && checks.screenShare.app) return checks.screenShare.app;
  if (checks.camera.status === "fail") return `camera:${checks.camera.problem ?? "error"}`;
  if (checks.network.status === "fail") return "network";
  const lockRequired = context.joined?.exam.checks.lock ?? true;
  if (lockRequired && checks.lock !== null && checks.lock !== "paired") return "browser_lock";
  if (checks.storage.status === "fail") return "storage";
  return undefined;
}

/** `status` for ingest: the check-in step (1.2 to 1.4) or the question on screen (2.1). */
export function ingestStatus(snapshot: FlowSnapshot): IngestStatus | undefined {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  switch (stage) {
    case "system": {
      const detail = checkDetail(context)?.slice(0, STATUS_DETAIL_MAX);
      return detail ? { step: "checking", detail } : { step: "checking" };
    }
    case "identity":
    case "identityMatched":
      return { step: "identity" };
    case "identityHelp":
      return { step: "identity", detail: "help" };
    case "rules":
      return { step: context.agreed ? "ready" : "rules" };
    case "writing":
    case "selfPaused":
    case "proctorPaused":
      return context.questions && context.questions.length > 0
        ? { question: context.exam.index + 1 }
        : undefined;
    default:
      return undefined;
  }
}

/** The host of a URL or a bare host, when it is a valid Host. */
export function hostOf(site: string): string | null {
  let candidate = site.trim();
  if (candidate.includes("://")) {
    try {
      candidate = new URL(candidate).host;
    } catch {
      return null;
    }
  } else {
    candidate = candidate.replace(/\/.*$/, "");
  }
  const parsed = Host.safeParse(candidate.toLowerCase());
  return parsed.success ? parsed.data : null;
}

/** allowed_hosts for the Lock: the host of lms_url plus allowed_sites in browser exams, none in app exams. */
export function allowedHosts(context: FlowContext): string[] {
  const exam = context.joined?.exam;
  if (exam?.mode !== "browser") return [];
  const hosts = [exam.lms_url, ...exam.allowed_sites].flatMap((site) => {
    const host = site ? hostOf(site) : null;
    return host ? [host] : [];
  });
  return [...new Set(hosts)];
}

function lockPhase(snapshot: FlowSnapshot): ExamStatePhase {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  if (!context.joined) return "idle";
  switch (stage) {
    case "waitingLock":
      return "ready";
    case "writing":
      return "writing";
    case "selfPaused":
    case "proctorPaused":
      return "paused";
    case "submitting":
    case "ending":
    case "submitted":
    case "ended":
      return "done";
    case "rules":
      return context.timer !== null && (context.startRequested || context.now >= context.timer.startsAt)
        ? "ready"
        : "lobby";
    default:
      return "lobby";
  }
}

/** The `exam.state` message for Üki Lock, sent on every change and every 5 s. */
export function lockExamState(snapshot: FlowSnapshot): Extract<AppToLock, { type: "exam.state" }> {
  const { context } = snapshot;
  const joined = context.joined;
  return {
    type: "exam.state",
    phase: lockPhase(snapshot),
    watch: context.watch.phone !== null ? "phone_found" : "watching",
    locale: context.locale,
    exam:
      joined && context.timer
        ? {
            session_id: joined.session.id,
            mode: joined.exam.mode,
            title: joined.exam.title,
            starts_at: new Date(context.timer.startsAt).toISOString(),
            ends_at: new Date(effectiveEndsAt(context.timer)).toISOString(),
            allowed_hosts: allowedHosts(context),
            lms_url: joined.exam.lms_url,
            done_path: joined.exam.lms_done_path,
          }
        : null,
  };
}

// Steady state derived from a flow snapshot. The runtime compares each value with the last one it
// applied and calls the matching service when it changes, so a restart or a missed effect can never
// leave the window locked or the camera running by mistake.
import {
  type AppToLock,
  appDetail,
  CardTries,
  type ExamStatePhase,
  formatStatusDetail,
  Host,
  type IngestStatus,
  type StatusDetail,
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
 * The exam holds the app, in both modes, from its start until 3.1 or 2.1d: the 15 s process scan runs
 * (a blocked app or screen-sharing tool that appears sends tab.blocked with its name), and the main
 * process refuses close and quit while it does, also while 2.1c, 2.1e or an offline submit brings a
 * browser exam's window out of the tray. A browser exam starts when Üki Lock reports lock.started.
 */
export function wantsExamWatch(snapshot: FlowSnapshot): boolean {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  if (!context.joined || !context.exam.startedSent) return false;
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

/**
 * The first failing 1.2 row as a status detail (packages/contracts/src/status-detail.ts), in the
 * screen's order: other apps, screen sharing, camera, network, browser lock, storage. A camera with no
 * picture at all is `busy` (1.2 tells the student to close the other apps that use it).
 */
export function checkDetail(context: FlowContext): StatusDetail | null {
  const { checks } = context;
  const app =
    (checks.apps.status === "fail" && checks.apps.app ? appDetail(checks.apps.app) : null) ??
    (checks.screenShare.status === "fail" && checks.screenShare.app
      ? appDetail(checks.screenShare.app)
      : null);
  if (app) return app;
  if (checks.camera.status === "fail") {
    const problem = checks.camera.problem;
    return { kind: "camera", problem: problem === null || problem === "no_camera" ? "busy" : problem };
  }
  if (checks.network.status === "fail") {
    return { kind: "network", problem: checks.network.ms === null ? "offline" : "slow" };
  }
  const lockRequired = context.joined?.exam.checks.lock ?? true;
  if (lockRequired && checks.lock !== null && checks.lock !== "paired") {
    return { kind: "lock", problem: "not_paired" };
  }
  // A failed scan (no free space figure) is not low storage.
  if (checks.storage.status === "fail" && checks.storage.freeGb !== null)
    return { kind: "storage", problem: "low" };
  return null;
}

/** Failed card tries as the detail carries them (1 to 99). */
function cardTries(tries: number): number {
  return CardTries.parse(Math.min(99, Math.max(1, Math.floor(tries))));
}

/** `status` for ingest: the check-in step (1.2 to 1.4) with its detail, or the question on screen (2.1). */
export function ingestStatus(snapshot: FlowSnapshot): IngestStatus | undefined {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  switch (stage) {
    case "system": {
      const detail = checkDetail(context);
      return detail ? { step: "checking", detail: formatStatusDetail(detail) } : { step: "checking" };
    }
    case "identity": {
      // 1.3 after a failed try: "Card unreadable · retry 2 of 3" in the lobby.
      const { tries, status } = context.identity;
      return tries > 0 && status !== "matched"
        ? {
            step: "identity",
            detail: formatStatusDetail({ kind: "card", problem: "retry", tries: cardTries(tries) }),
          }
        : { step: "identity" };
    }
    case "identityMatched":
      return { step: "identity" };
    case "identityHelp":
      return {
        step: "identity",
        detail: formatStatusDetail({
          kind: "card",
          problem: "help",
          tries: cardTries(context.identity.tries),
        }),
      };
    case "rules":
      // The agree box: ready with the language the rules were read in, which ingest stamps once with
      // sessions.rules_accepted_at (the consent record A.3 shows).
      return context.agreed ? { step: "ready", rules_locale: context.locale } : { step: "rules" };
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
    default:
      // 1.4 included: the exam opens the moment the box is ticked and the start has come (canStart), so
      // the Lock offers Lock and start only once the exam waits for it (ready above).
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

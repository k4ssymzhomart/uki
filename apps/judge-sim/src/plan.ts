// `--dry-run`: the configuration, the two cadences, what each episode costs, the free-plan arithmetic for
// 30 days and a sample plan from the scheduler on a virtual clock. Talks to nothing, writes nothing.
import {
  DAILY_MESSAGE_BUDGET,
  FREE_PLAN,
  hourCost,
  monthEstimate,
  percent,
  watchedHoursAllowed,
} from "./budget.ts";
import type { Config } from "./config.ts";
import { type EpisodeKind, INCIDENT_KINDS, planCost, planEpisode } from "./episodes.ts";
import { createRng } from "./rng.ts";
import {
  CADENCE,
  chooseIncident,
  chooseStudent,
  type Mode,
  nextAnswerDelayMs,
  nextIncidentDelayMs,
} from "./scheduler.ts";
import { localeFor } from "./student.ts";

const MB = 1024 * 1024;

function n(value: number, digits = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `+${hh}:${mm}:${ss}`;
}

export interface PlannedEpisode {
  atMs: number;
  mode: Mode;
  kind: EpisodeKind;
  number: string;
}

/** The scheduler's choices for `minutes` of idle, then `minutes` of watched, on a virtual clock. */
export function samplePlan(students: readonly string[], minutes: number, seed: number): PlannedEpisode[] {
  const rng = createRng(seed);
  const last = new Map(students.map((number) => [number, 0]));
  const out: PlannedEpisode[] = [];
  let lastAsk: number | null = null;
  for (const [index, mode] of (["idle", "watched"] as const).entries()) {
    const cadence = CADENCE[mode];
    const start = index * minutes * 60_000;
    const end = start + minutes * 60_000;
    let incidentAt = start + nextIncidentDelayMs(rng, cadence);
    let answerAt = start + (nextAnswerDelayMs(rng, cadence, students.length) ?? Number.POSITIVE_INFINITY);
    while (Math.min(incidentAt, answerAt) < end) {
      const isIncident = incidentAt <= answerAt;
      const at = isIncident ? incidentAt : answerAt;
      const kind: EpisodeKind = isIncident ? chooseIncident(rng, cadence, lastAsk, at) : "answer";
      const who = chooseStudent(
        rng,
        students.map((number) => ({ number, lastEpisodeAtMs: last.get(number) ?? 0 })),
      );
      if (who !== null) {
        last.set(who.number, at);
        out.push({ atMs: at, mode, kind, number: who.number });
        if (kind === "ask_proctor") lastAsk = at;
      }
      if (isIncident) incidentAt = at + nextIncidentDelayMs(rng, cadence);
      else answerAt = at + (nextAnswerDelayMs(rng, cadence, students.length) ?? Number.POSITIVE_INFINITY);
    }
  }
  return out;
}

export function renderPlan(config: Config): string {
  const lines: string[] = [];
  const students = config.students;
  const push = (line = "") => lines.push(line);

  push("judge-sim dry run: nothing is sent and nothing is written.");
  push();
  push("Configuration");
  push(`  project           ${config.url ?? "(not set; needed to run)"}`);
  push(`  publishable key   ${config.publishableKey === null ? "(not set; needed to run)" : "set"}`);
  push(`  exam              ${config.examCode}`);
  push(
    `  students          ${students.length}: ${students.slice(0, 3).join(", ")}${students.length > 3 ? ` … ${students.at(-1)}` : ""} ` +
      `(languages: ${["kk", "ru", "en"].map((l) => `${students.filter((s) => localeFor(s) === l).length} ${l}`).join(", ")})`,
  );
  push(`  state             ${config.stateDir}`);
  push(
    `  logs              ${config.logDir} (judge-sim.log, ${config.logFiles} files of ${n(config.logMaxBytes / MB, 1)} MB at most)`,
  );
  push(`  Realtime budget   ${n(config.dailyMessageBudget)} messages a day (UTC)`);
  push();
  push("Cadence");
  push("  mode      heartbeat  poll   incident  answer per student  Ask proctor");
  for (const mode of ["idle", "watched"] as const) {
    const c = CADENCE[mode];
    push(
      `  ${mode.padEnd(9)} ${`${c.heartbeatS} s`.padEnd(10)} ${`${c.pollS} s`.padEnd(6)} ${`${c.incidentEveryS} s`.padEnd(9)} ` +
        `${(c.answerEveryS === null ? "none" : `${c.answerEveryS} s`).padEnd(19)} ${c.askMinGapS === null ? "none" : `at most every ${c.askMinGapS} s`}`,
    );
  }
  push(
    "  Watched while a DEMO-LIVE wall is open (demo_live_status counts walls seen in the last 90 s), within the budget.",
  );
  push();
  push("Episodes: broadcasts, Edge Function calls and stills each one causes");
  const rng = createRng(1);
  for (const kind of [...INCIDENT_KINDS, "answer", "ask_proctor"] as const) {
    const plan = planEpisode(kind, rng, {
      gazeS: 2,
      faceMissingS: 10,
      locale: "kk",
      next: { id: "00000000-0000-4000-8000-000000000001", position: 1, choiceIds: ["a"] },
      questionCount: 20,
    });
    const cost = planCost(plan);
    const events = plan.steps.flatMap((step) => step.events.map((event) => event.type)).join(", ");
    push(
      `  ${kind.padEnd(14)} ${String(cost.broadcasts).padStart(2)} ${String(cost.invocations).padStart(2)} ${String(cost.stills).padStart(2)}  ${events}`,
    );
  }
  push();
  const idle = hourCost("idle", students.length);
  const watched = hourCost("watched", students.length);
  push(`One hour, ${students.length} students, no wall open`);
  push(
    `  idle      ${n(idle.broadcasts)} broadcasts (${n(idle.heartbeats)} heartbeats, ${n(idle.incidents, 1)} incidents), ` +
      `${n(idle.invocations, 1)} function calls, ${n(idle.egressBytes / MB, 1)} MB egress`,
  );
  push(
    `  watched   ${n(watched.broadcasts)} broadcasts (${n(watched.heartbeats)} heartbeats, ${n(watched.incidents, 1)} incidents, ` +
      `${n(watched.answers)} answers, ${n(watched.asks, 1)} asks), ${n(watched.invocations, 1)} function calls, ` +
      `${n(watched.egressBytes / MB, 1)} MB egress; each open wall receives every broadcast once more`,
  );
  push();
  push("Free plan, 30 days of 24/7 running (Supabase docs, read 9 Oct 2026)");
  const one = watchedHoursAllowed(students.length, 1, config.dailyMessageBudget);
  const two = watchedHoursAllowed(students.length, 2, config.dailyMessageBudget);
  const scenarios = [
    { label: "idle only", hours: 0, viewers: 0 },
    { label: `budget used, 1 wall (${n(one, 1)} h/day)`, hours: one, viewers: 1 },
    { label: `budget used, 2 walls (${n(two, 1)} h/day)`, hours: two, viewers: 2 },
  ];
  push(
    "  scenario                          Realtime msgs         Function calls      Egress               Stills held",
  );
  for (const scenario of scenarios) {
    const m = monthEstimate({
      students: students.length,
      watchedHoursPerDay: scenario.hours,
      viewers: scenario.viewers,
    });
    push(
      `  ${scenario.label.padEnd(33)} ${`${n(m.realtimeMessages)} (${percent(m.realtimeMessages, FREE_PLAN.realtimeMessagesPerMonth)})`.padEnd(21)} ` +
        `${`${n(m.invocations)} (${percent(m.invocations, FREE_PLAN.edgeFunctionInvocationsPerMonth)})`.padEnd(19)} ` +
        `${`${n(m.egressBytes / MB)} MB (${percent(m.egressBytes, FREE_PLAN.egressBytesPerMonth)})`.padEnd(20)} ` +
        `${n(m.storageBytes / MB, 1)} MB (${percent(m.storageBytes, FREE_PLAN.storageBytes)})`,
    );
  }
  push(
    `  Quotas: ${n(FREE_PLAN.realtimeMessagesPerMonth)} Realtime messages, ${n(FREE_PLAN.edgeFunctionInvocationsPerMonth)} function calls, ` +
      `${n(FREE_PLAN.egressBytesPerMonth / MB / 1024)} GB egress, ${n(FREE_PLAN.storageBytes / MB / 1024)} GB Storage, ` +
      `${n(FREE_PLAN.databaseBytes / MB)} MB database, ${FREE_PLAN.realtimePeakConnections} Realtime connections (the simulator opens none).`,
  );
  push(
    `  The daily budget (${n(config.dailyMessageBudget)}; default ${n(DAILY_MESSAGE_BUDGET)}) caps Realtime at ` +
      `${percent(config.dailyMessageBudget * 30, FREE_PLAN.realtimeMessagesPerMonth)} of the month, whatever the judges do.`,
  );
  push();
  const plan = samplePlan(students, config.planMinutes, config.seed);
  push(
    `Sample plan, seed ${config.seed}: ${config.planMinutes} minutes idle, then ${config.planMinutes} minutes watched`,
  );
  const shown = plan.slice(0, 60);
  for (const episode of shown) {
    push(`  ${clock(episode.atMs)}  ${episode.mode.padEnd(8)} ${episode.kind.padEnd(14)} ${episode.number}`);
  }
  if (plan.length > shown.length) push(`  … ${plan.length - shown.length} more`);
  const count = (mode: Mode) => plan.filter((e) => e.mode === mode).length;
  push(`  ${count("idle")} episodes idle, ${count("watched")} watched.`);
  return `${lines.join("\n")}\n`;
}

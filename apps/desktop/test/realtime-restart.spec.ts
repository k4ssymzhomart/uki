// P.10 (docs/phase-1-plan.md): Realtime restarts during an exam, the lead proctor pauses from the wall
// while it is down or coming back, and the student app still shows 2.1c within about 10 s, through the
// ingest reply's pending_commands ("Session commands and status detail" in docs/decisions.md: every
// reply carries the session's unacked commands, and the app calls ingest at least every 10 s). Then the
// proctor resumes, 2.1 returns, and neither command applies twice.
//
// The real Electron app (e2e build, synthetic camera) against the local stack, like e2e.spec.ts; the
// proctor's side is the command Edge Function as the exam's lead proctor, exactly as the wall calls
// it. Each round takes Realtime's container down with Docker, in turn:
//   - stop:      `docker stop`, the pause right after the next ingest reply (the worst case: it waits a
//                whole heartbeat), 2.1c, then `docker start`. Realtime is down the whole time, so only
//                an ingest reply can carry the pause.
//   - restart:   `docker restart`, and the pause as soon as Realtime stops answering.
//   - reconnect: `docker restart`, and the pause as soon as Realtime answers again, while the app's
//                channel is still rejoining.
// In the last two the first path wins: an ingest reply, the catch-up read when the channel joins
// again, or the broadcast. Every arrival of a command at the window (Realtime frame, ingest reply,
// catch-up read) is read from the window's network, so the evidence names the path that delivered it.
//
// Realtime is started again after every round, in afterAll and in the global teardown, also when a
// test fails. It stops Realtime for everyone on the stack: run it only when nobody else needs it.
//
//   pnpm --filter desktop e2e:realtime
//   UKI_E2E_RT_ROUNDS=6   rounds, cycling stop, restart and reconnect (default 3)
//
// Writes test/results/realtime-restart-evidence.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { readStackEnv, type StackEnv } from "../../../test/integration/stack.ts";
import { DESKTOP_DIR, type LaunchedApp, launchApp } from "./support/app.ts";
import { admin, createFixture, destroyWorkspace, type Fixture, STUDENTS } from "./support/fixture.ts";
import { messagesFor } from "./support/messages.ts";
import {
  armFrameWatch,
  currentFrame,
  type OutboxAnswer,
  outboxRows,
  waitForFrame,
} from "./support/probes.ts";
import { command, sessionOf, startExam } from "./support/proctor.ts";
import {
  type Carrier,
  type CommandPath,
  containerRunning,
  ensureRealtimeRunning,
  PingWatch,
  pollUntil,
  realtimeContainer,
  realtimePing,
  restartContainer,
  startContainer,
  stopContainer,
  WindowNetwork,
} from "./support/realtime.ts";

const RESULTS = join(DESKTOP_DIR, "test", "results");
const ROUNDS = Math.max(1, Number(process.env.UKI_E2E_RT_ROUNDS ?? 3));
const ORDER = ["stop", "restart", "reconnect"] as const;
type Variant = (typeof ORDER)[number];
const VARIANTS: Variant[] = Array.from({ length: ROUNDS }, (_, i) => ORDER[i % ORDER.length] ?? "stop");
const TITLES: Record<Variant, string> = {
  stop: "Realtime stopped, a pause right after a heartbeat shows 2.1c through the next ingest reply within about 10 s",
  restart: "Realtime restarting, a pause sent while it is down shows 2.1c within about 10 s",
  reconnect: "Realtime back before the channel joins, the pause shows 2.1c within about 10 s",
};
/**
 * "Within about 10 s": the app calls ingest at least every 10 s (THRESHOLDS.outbox.ingestHeartbeatMs,
 * checked on the loop's 2 s tick), plus the ingest round trip and the apply. 11 s leaves 1 s for those.
 */
const FALLBACK_BUDGET_MS = 11_000;
/** After a resume, 2.1 must hold this long (past the next heartbeat), so no command applies twice. */
const HOLD_MS = 12_000;

const en = messagesFor("en");

interface CommandTrip {
  id: string;
  /** Laptop ms just before the request to the command function left. */
  sentAt: number;
  /** The command function's round trip. */
  functionMs: number;
  /** From sentAt to the frame on screen. */
  shownAfterMs: number;
  /** The first arrival at the window: the path that applied it. */
  via: CommandPath | null;
  /** Every arrival, ms after sentAt. */
  carriers: Array<{ via: CommandPath; afterMs: number }>;
  /** Ms between the last ingest reply before the command and the command's request. */
  sinceLastIngestMs: number | null;
}

interface RoundEvidence {
  round: number;
  variant: Variant;
  /** Every *AfterMs counts from the Docker command (stop or restart) of the round. */
  /** `docker stop` or `docker restart` returned. */
  dockerDoneAfterMs: number | null;
  /** The first ping Realtime did not answer. */
  realtimeDownAfterMs: number;
  /** The app's Realtime socket closed. */
  appSocketClosedAfterMs: number | null;
  pauseSentAfterMs: number;
  /** The session channel had joined again before the pause left (reconnect rounds may race it). */
  channelJoinedWhenPauseSent: boolean;
  pauseShownAfterMs: number;
  realtimeAnsweredWhenPauseShown: boolean | null;
  /** The first ping Realtime answered again. */
  realtimeUpAfterMs: number;
  /** The app's session channel joined again (the ok reply to its phx_join). */
  channelRejoinedAfterMs: number;
  resumeSentAfterMs: number;
  resumeShownAfterMs: number;
  pause: CommandTrip;
  resume: CommandTrip;
  /** Gaps between consecutive ingest replies during the round: the heartbeat. */
  ingestGapsMs: { max: number; count: number };
  pauseAckedOnServer: boolean;
  heldOn21ForMs: number;
}

const evidence = {
  date: new Date().toISOString(),
  container: "",
  rounds: [] as RoundEvidence[],
  start: {} as Record<string, unknown>,
  finalCheck: {} as Record<string, unknown>,
  realtimeRunningAfterRun: null as boolean | null,
};

let stack: StackEnv;
let container = "";
let fixture: Fixture;
let madina: LaunchedApp;
let network: WindowNetwork;
let sessionId = "";

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** The question's choices (the title bar's language switch is a radio group too). */
function choice(page: Page, index: number) {
  return page.locator("main").getByRole("radio").nth(index);
}

async function answerAndNext(page: Page, index: number): Promise<void> {
  await choice(page, index).click();
  await button(page, en.exam.next).click();
}

/** Reads until `ok` holds; a read that throws counts as not yet. */
async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      const value = await read();
      if (ok(value)) return value;
      last = value;
    } catch (error) {
      last = error instanceof Error ? error.message : error;
    }
    if (Date.now() > deadline)
      throw new Error(`${what}: not within ${timeoutMs} ms (${JSON.stringify(last)})`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what}: not within ${ms} ms`)), ms)),
  ]);
}

/** The session's commands on the server, oldest first. */
async function serverCommands(id: string) {
  const { data, error } = await admin(stack)
    .from("session_commands")
    .select("id, type, acked_at")
    .eq("session_id", id)
    .order("issued_at");
  if (error) throw new Error(`session_commands: ${error.message}`);
  return data;
}

/** The commands the app recorded as applied (outbox `commands`, one row per command id). */
async function appliedCommands(page: Page) {
  return outboxRows<{ id: string; type: string; appliedAt: number; ackedAt: number | null }>(
    page,
    "commands",
  );
}

/** Sends a command as the lead proctor and times it to `frame` on screen, with the path it took. */
async function sendAndTime(page: Page, type: "pause" | "resume", frame: string): Promise<CommandTrip> {
  const seen = await armFrameWatch(page, frame);
  const lastIngest = network.ingestRepliesBetween(0, Date.now()).at(-1) ?? null;
  const issued = await command(fixture, { session_id: sessionId, type, payload: {} });
  const id = issued.ids[0] ?? "";
  const shownAt = await within(seen(), 60_000, `${frame} after ${type}`);
  await network.settle();
  const carriers = network.carriers(id).filter((carrier) => carrier.at >= issued.sentAt);
  return {
    id,
    sentAt: issued.sentAt,
    functionMs: issued.answeredAt - issued.sentAt,
    shownAfterMs: shownAt - issued.sentAt,
    via: firstBefore(carriers, shownAt),
    carriers: carriers.map((carrier) => ({
      via: carrier.via,
      afterMs: Math.round(carrier.at - issued.sentAt),
    })),
    sinceLastIngestMs: lastIngest === null ? null : Math.round(issued.sentAt - lastIngest),
  };
}

/**
 * The path that applied a command: its first arrival. Frames and replies are stamped when Playwright
 * hears of them, a few ms after the window does, so an arrival up to 250 ms after the frame counts.
 */
function firstBefore(carriers: readonly Carrier[], shownAt: number): CommandPath | null {
  const first = carriers[0];
  return first && first.at <= shownAt + 250 ? first.via : null;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  mkdirSync(RESULTS, { recursive: true });
  stack = readStackEnv();
  container = realtimeContainer();
  evidence.container = container;
  // Never start from a stopped Realtime: that is someone else's state, not this test's.
  expect(await containerRunning(container), `${container} runs before the test`).toBe(true);
  expect(await realtimePing(stack), "Realtime answers its ping before the test").toBe(true);
  fixture = await createFixture({ startsInMin: 20 });
  madina = await launchApp("realtime");
  // Before the join: the app's Realtime socket opens right after it.
  network = new WindowNetwork(madina.page);
});

test.afterAll(async () => {
  // Realtime runs again whatever happened above.
  let restoreError: unknown = null;
  try {
    await ensureRealtimeRunning(stack ?? null, container || realtimeContainer());
  } catch (error) {
    restoreError = error;
  }
  evidence.realtimeRunningAfterRun = await containerRunning(container || realtimeContainer()).catch(
    () => null,
  );
  writeFileSync(join(RESULTS, "realtime-restart-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  if (madina) writeFileSync(join(RESULTS, "realtime-restart.log"), madina.logs.join("\n"));
  await madina?.close();
  if (fixture) await destroyWorkspace(fixture.workspaceId);
  if (restoreError) throw restoreError;
});

test.afterEach(async ({ browserName: _ }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && madina) {
    await testInfo.attach("app-log", { body: madina.logs.slice(-300).join("\n"), contentType: "text/plain" });
    await madina.page.screenshot({ path: testInfo.outputPath("failure.png") }).catch(() => {});
  }
});

test("2.1: the student checks in, the lead proctor starts the exam, and the student writes", async () => {
  const { page } = madina;
  await waitForFrame(page, "1.1", 60_000);
  await page.getByText("ENG", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^en/);
  await page.locator('input[name="code"]').fill(fixture.code);
  await page.locator('input[name="studentNumber"]').fill(STUDENTS.madina.number);
  // A slow gateway answers 504 now and then; a student presses Continue again.
  for (let attempt = 1; ; attempt += 1) {
    await button(page, en.action.continue).click();
    try {
      await waitForFrame(page, "1.2", 30_000);
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
  const next = button(page, en.action.continue);
  for (let again = 0; ; again += 1) {
    try {
      await expect(next).toBeEnabled({ timeout: 20_000 });
      break;
    } catch (error) {
      if (again >= 4) throw error;
      await button(page, en.check.again).click();
    }
  }
  await next.click();
  await waitForFrame(page, "1.3");
  await expect(button(page, en.action.continue)).toBeEnabled({ timeout: 120_000 });
  await button(page, en.action.continue).click();
  await waitForFrame(page, "1.4");
  await page.getByRole("checkbox").click();
  const ready = await until(
    () => sessionOf(fixture, STUDENTS.madina.number),
    (s) => s?.state === "ready",
    90_000,
    "session ready on the server",
  );
  sessionId = ready?.id ?? "";

  const seen = await armFrameWatch(page, "2.1");
  const started = await startExam(fixture);
  evidence.start = { startToScreenMs: (await seen()) - started.sentAt };
  for (let i = 0; i < 3; i += 1) await answerAndNext(page, i % 4);
  await until(
    () => outboxRows<OutboxAnswer>(page, "answers"),
    (answers) => answers.length === 3 && answers.every((a) => a.syncedAt !== null),
    90_000,
    "answers synced",
  );
  await pollUntil(() => network.channelUp(sessionId), 60_000, "session channel joined");
});

for (const [index, variant] of VARIANTS.entries()) {
  test(`round ${index + 1} (${variant}): ${TITLES[variant]}`, async () => {
    const { page } = madina;
    await waitForFrame(page, "2.1", 30_000);
    await pollUntil(() => network.channelUp(sessionId), 90_000, "session channel joined before the round");
    // The student writes.
    await answerAndNext(page, (index + 1) % 4);

    const ping = new PingWatch(stack);
    const marks: { dockerDoneAt: number | null } = { dockerDoneAt: null };
    let docker: Promise<void> | null = null;
    const t0 = Date.now();
    try {
      docker = (variant === "stop" ? stopContainer(container) : restartContainer(container)).then(() => {
        marks.dockerDoneAt = Date.now();
      });
      const downAt = await ping.waitFor(false, t0, 30_000, "Realtime down");
      if (variant === "stop") {
        await docker;
        // The worst case: the pause right after an ingest reply waits a whole heartbeat for the next.
        const from = Date.now();
        await pollUntil(
          () => network.ingestRepliesBetween(from, Date.now()).length > 0,
          30_000,
          "ingest",
          10,
        );
      }
      // reconnect: Realtime answers again, and the app's channel has not joined yet (or just has).
      if (variant === "reconnect") await ping.waitFor(true, downAt, 90_000, "Realtime back");

      // The wall's Pause.
      const pause = await sendAndTime(page, "pause", "2.1c");
      const shownAt = pause.sentAt + pause.shownAfterMs;
      // The app acks what it applied through PostgREST, which Realtime's absence does not touch.
      const acked = await until(
        () => serverCommands(sessionId),
        (rows) => rows.some((row) => row.id === pause.id && row.acked_at !== null),
        30_000,
        "pause acked on the server",
      ).then(
        () => true,
        () => false,
      );

      // Realtime runs again, and the app's channel joins again.
      if (variant === "stop") await startContainer(container);
      await docker;
      docker = null;
      const upAt = await ping.waitFor(true, downAt, 90_000, "Realtime back");
      const rejoinedAt = await pollUntil(
        () => network.channelUp(sessionId),
        90_000,
        "session channel joined again",
        100,
      );

      // The wall's Resume: 2.1 returns,
      const resume = await sendAndTime(page, "resume", "2.1");
      // and holds past the next heartbeat: no later reply or read applies the pause again.
      const holdFrom = Date.now();
      const frames = new Set<string | null>();
      while (Date.now() - holdFrom < HOLD_MS) {
        frames.add(await currentFrame(page));
        await page.waitForTimeout(500);
      }
      const roundEnd = Date.now();

      const replies = network.ingestRepliesBetween(t0, roundEnd);
      const gaps = replies.slice(1).map((at, i) => at - (replies[i] ?? at));
      const socketClosed = network
        .socketLog()
        .map((socket) => socket.closedAt)
        .find((closedAt): closedAt is number => closedAt !== null && closedAt >= t0);
      const after = (at: number | null) => (at === null ? null : Math.round(at - t0));
      const round: RoundEvidence = {
        round: index + 1,
        variant,
        dockerDoneAfterMs: after(marks.dockerDoneAt),
        realtimeDownAfterMs: after(downAt) ?? 0,
        appSocketClosedAfterMs: after(socketClosed ?? null),
        pauseSentAfterMs: after(pause.sentAt) ?? 0,
        channelJoinedWhenPauseSent: network.joinsBetween(sessionId, t0, pause.sentAt).length > 0,
        pauseShownAfterMs: after(shownAt) ?? 0,
        realtimeAnsweredWhenPauseShown: ping.answeredAt(shownAt),
        realtimeUpAfterMs: after(upAt) ?? 0,
        channelRejoinedAfterMs: after(rejoinedAt) ?? 0,
        resumeSentAfterMs: after(resume.sentAt) ?? 0,
        resumeShownAfterMs: after(resume.sentAt + resume.shownAfterMs) ?? 0,
        pause,
        resume,
        ingestGapsMs: { max: Math.round(Math.max(0, ...gaps)), count: replies.length },
        pauseAckedOnServer: acked,
        heldOn21ForMs: HOLD_MS,
      };
      evidence.rounds.push(round);
      madina.logs.push(`[test] round ${index + 1} ${JSON.stringify(round)}`);

      expect(pause.via, "the pause's path is known").not.toBeNull();
      expect(pause.shownAfterMs, "2.1c within about 10 s of the pause").toBeLessThan(FALLBACK_BUDGET_MS);
      if (variant === "stop") {
        // Realtime was down from before the pause until after 2.1c: only an ingest reply could carry it.
        expect(round.realtimeAnsweredWhenPauseShown, "Realtime still down when 2.1c showed").toBe(false);
        expect(pause.via, "the pause came with an ingest reply").toBe("ingest");
      }
      expect(acked, "the pause is acked on the server").toBe(true);
      expect(resume.shownAfterMs, "2.1 within about 10 s of the resume").toBeLessThan(FALLBACK_BUDGET_MS);
      expect([...frames], "2.1 holds after the resume").toEqual(["2.1"]);
    } finally {
      // Never leave Realtime stopped, whatever failed above.
      await (docker as Promise<void> | null)?.catch(() => {});
      await ping.stop();
      await ensureRealtimeRunning(stack, container);
    }
  });
}

test("each command applied once, acked, and the session writes on", async () => {
  const { page } = madina;
  const server = await until(
    () => serverCommands(sessionId),
    (rows) => rows.every((row) => row.acked_at !== null),
    30_000,
    "every command acked",
  );
  const applied = await appliedCommands(page);
  const pauses = server.filter((row) => row.type === "pause").map((row) => row.id);
  const resumes = server.filter((row) => row.type === "resume").map((row) => row.id);
  const session = await sessionOf(fixture, STUDENTS.madina.number);
  evidence.finalCheck = {
    serverCommands: server.map((row) => row.type),
    appliedByApp: applied.length,
    appliedIdsUnique: new Set(applied.map((row) => row.id)).size === applied.length,
    sessionState: session?.state,
    frame: await currentFrame(page),
  };
  expect(pauses).toHaveLength(VARIANTS.length);
  expect(resumes).toHaveLength(VARIANTS.length);
  // The outbox keeps one row per applied command id, stamped when it applied. Each command applied and
  // was acked, and its stamp is the apply that showed the frame: a later apply would have moved it.
  for (const round of evidence.rounds) {
    for (const trip of [round.pause, round.resume]) {
      const row = applied.find((r) => r.id === trip.id);
      expect(row, `${trip.id} applied`).toBeTruthy();
      expect(row?.ackedAt, `${trip.id} acked by the app`).not.toBeNull();
      expect((row?.appliedAt ?? 0) - trip.sentAt, `${trip.id} applied once`).toBeLessThanOrEqual(
        trip.shownAfterMs + 1000,
      );
    }
  }
  expect(session?.state).toBe("writing");
  expect(await currentFrame(page)).toBe("2.1");
  expect(await realtimePing(stack), "Realtime runs after the rounds").toBe(true);
});

// The student path end to end in the real Electron app (WP 0.6): join, system check, identity, rules,
// Start exam from the lead proctor, answers, a network cut, the proctor's pause, message, added time and
// end, the phone warning, the no-face pause, submit and the receipt. The camera is the e2e build's
// synthetic camera (src/renderer/integration/synthetic-camera.ts); everything else is real: the main
// process, the uki:// scheme, window.uki, detection, the outbox, Realtime and the Edge Functions.
//
// Writes each frame's screenshot to test/results/frames/ and the measured numbers to
// test/results/e2e-evidence.json.
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { RECEIPT_ID_PATTERN } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { DESKTOP_DIR, type LaunchedApp, launchApp } from "./support/app.ts";
import { connectFakeLock } from "./support/fake-lock.ts";
import { createFixture, destroyWorkspace, type Fixture, STUDENTS } from "./support/fixture.ts";
import { messagesFor } from "./support/messages.ts";
import {
  armFrameWatch,
  currentFrame,
  type OutboxAnswer,
  type OutboxEvent,
  outboxRows,
  sampleDetection,
  setScene,
  waitForFrame,
} from "./support/probes.ts";
import { command, framesOf, serverRecord, sessionOf, startExam } from "./support/proctor.ts";

const RESULTS = join(DESKTOP_DIR, "test", "results");
const FRAMES_DIR = join(RESULTS, "frames");
const OFFLINE_S = Number(process.env.UKI_E2E_OFFLINE_S ?? 20);
const KIOSK = process.env.UKI_E2E_KIOSK === "1";
/** The exam's phone_score for this run (see beforeAll). */
const PHONE_SCORE = 0.7;
/** Exit criterion 7: proctor pause, message and end reach the app within 1 second. */
const COMMAND_BUDGET_MS = 1000;

const messages = { kk: messagesFor("kk"), ru: messagesFor("ru"), en: messagesFor("en") };
const en = messages.en;
const LABELS: Record<Locale, string> = { kk: "ҚАЗ", ru: "РУС", en: "ENG" };

test.describe.configure({ mode: "serial" });

const evidence = {
  date: new Date().toISOString(),
  offlineSeconds: OFFLINE_S,
  kiosk: KIOSK,
  latencyMs: {} as Record<string, number>,
  /** The command function's own round trip for each command, for reading latencyMs. */
  functionMs: {} as Record<string, number>,
  /** Commands the shared stack refused with a 5xx first (sent again, as a proctor would). */
  commandRetries: {} as Record<string, number>,
  /** Check again presses 1.2 needed (a slow /auth/v1/health on the shared stack fails the network row). */
  checkAgainPresses: 0,
  pairing: {} as Record<string, unknown>,
  offline: {} as Record<string, unknown>,
  identity: {} as Record<string, unknown>,
  phone: {} as Record<string, unknown>,
  receipt: {} as Record<string, unknown>,
  frames: [] as string[],
};

let fixture: Fixture;
let madina: LaunchedApp;
let sessionId = "";

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(FRAMES_DIR, `${name}.png`) });
  evidence.frames.push(name);
}

async function setLocale(page: Page, locale: Locale): Promise<void> {
  await page.getByText(LABELS[locale], { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "lang",
    locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : /^en/,
  );
}

/** The frame in Kazakh and Russian as well, then back to English. */
async function shotInEveryLanguage(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-en`);
  for (const locale of ["kk", "ru"] as const) {
    await setLocale(page, locale);
    await shot(page, `${name}-${locale}`);
  }
  await setLocale(page, "en");
}

/**
 * Reads until `ok` holds. A read that throws (a statement timeout while other stacks load this laptop's
 * Docker) counts as not yet; the last value or error goes into the timeout message.
 */
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
      throw new Error(`${what}: not met within ${timeoutMs} ms (${JSON.stringify(last)})`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/** The server's answers and events for a session, read again if the read fails. */
function recordOf(id: string) {
  return until(
    () => serverRecord(fixture, id),
    () => true,
    90_000,
    "server record",
  );
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** A command's trip from the proctor's request to the frame on the student's screen. */
async function timeCommand(page: Page, frame: string, body: unknown, label: string): Promise<number> {
  madina.logs.push(`[test] ${label} with html lang ${await page.locator("html").getAttribute("lang")}`);
  const seen = await armFrameWatch(page, frame);
  const issued = await command(fixture, body);
  const at = await seen();
  const latency = at - issued.sentAt;
  evidence.latencyMs[label] = latency;
  evidence.functionMs[label] = issued.answeredAt - issued.sentAt;
  if (issued.attempts > 1) evidence.commandRetries[label] = issued.attempts - 1;
  return latency;
}

/** The question's choices (the title bar's language switch is a radio group too). */
function choice(page: Page, index: number) {
  return page.locator("main").getByRole("radio").nth(index);
}

async function answerAndNext(page: Page, index: number): Promise<void> {
  await choice(page, index).click();
  await button(page, en.exam.next).click();
}

async function allSynced(page: Page): Promise<{ answers: OutboxAnswer[]; events: OutboxEvent[] }> {
  return until(
    async () => ({
      answers: await outboxRows<OutboxAnswer>(page, "answers"),
      events: await outboxRows<OutboxEvent>(page, "events"),
    }),
    ({ answers, events }) =>
      answers.every((a) => a.syncedAt !== null) && events.every((e) => e.storedAt !== null),
    90_000,
    "outbox synced",
  );
}

/**
 * Continue on 1.1 until the frame comes. The shared local stack sometimes answers 504 for a moment
 * (Docker DNS inside the auth container); a student would press Continue again, and so does the test.
 */
async function joinExam(page: Page, expected: "1.1a" | "1.2"): Promise<void> {
  const networkError = page.getByText(en.check.network.fail, { exact: true });
  for (let attempt = 1; ; attempt += 1) {
    await button(page, en.action.continue).click();
    await networkError.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    const outcome = await Promise.race([
      waitForFrame(page, expected, 30_000).then(() => "ok" as const),
      networkError.waitFor({ timeout: 30_000 }).then(() => "network" as const),
    ]);
    if (outcome === "ok" || attempt >= 3) {
      if (outcome !== "ok") await waitForFrame(page, expected, 1000);
      return;
    }
    await page.waitForTimeout(2000);
  }
}

/**
 * Waits for every 1.2 row to be ready, pressing Check again as a student would when a row fails (the
 * network row fails when the shared stack is slow to answer /auth/v1/health).
 */
async function passSystemCheck(page: Page): Promise<number> {
  const next = button(page, en.action.continue);
  for (let again = 0; ; again += 1) {
    try {
      await expect(next).toBeEnabled({ timeout: 20_000 });
      return again;
    } catch (error) {
      if (again >= 4) throw error;
      await button(page, en.check.again).click();
    }
  }
}

/**
 * Join, system check, identity and rules for a late student: the exam has started, so ticking the
 * agree box on 1.4 opens 2.1 at once.
 */
async function checkInLate(app: LaunchedApp, number: string): Promise<void> {
  const { page } = app;
  await waitForFrame(page, "1.1", 60_000);
  await setLocale(page, "en");
  await page.locator('input[name="code"]').fill(fixture.code);
  await page.locator('input[name="studentNumber"]').fill(number);
  await joinExam(page, "1.2");
  await passSystemCheck(page);
  await button(page, en.action.continue).click();
  await waitForFrame(page, "1.3");
  await expect(button(page, en.action.continue)).toBeEnabled({ timeout: 120_000 });
  await button(page, en.action.continue).click();
  await waitForFrame(page, "1.4");
  await page.getByRole("checkbox").click();
  await waitForFrame(page, "2.1", 30_000);
}

test.beforeAll(async () => {
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });
  // EfficientDet-Lite0 scores the brand kit's phone picture at about 0.77, under the 0.85 default: the
  // exam's phone_score (an exam setting) is lowered so the run exercises the whole 2.2 path. The real
  // threshold is a tuning question for real phones on the demo laptops.
  fixture = await createFixture({ startsInMin: 20, checks: { phone_score: PHONE_SCORE } });
  madina = await launchApp("madina", { kiosk: KIOSK });
});

test.afterAll(async () => {
  if (madina) writeFileSync(join(RESULTS, "madina.log"), madina.logs.join("\n"));
  await madina?.close();
  if (fixture) await destroyWorkspace(fixture.workspaceId);
  writeFileSync(join(RESULTS, "e2e-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
});

test.afterEach(async ({ browserName: _ }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && madina) {
    await testInfo.attach("app-log", { body: madina.logs.slice(-300).join("\n"), contentType: "text/plain" });
    await madina.page.screenshot({ path: testInfo.outputPath("failure.png") }).catch(() => {});
  }
});

test("1.1 and 1.1a: the join form in three languages, a wrong code, then the right one", async () => {
  const { page } = madina;
  await waitForFrame(page, "1.1", 60_000);
  const heading = page.getByRole("heading", { level: 1 });
  // Kazakh first, as every student sees it.
  await expect(heading).toHaveText(messages.kk.join.title);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk-KZ");
  await shot(page, "1.1-kk");
  await setLocale(page, "ru");
  await expect(heading).toHaveText(messages.ru.join.title);
  await shot(page, "1.1-ru");
  await setLocale(page, "en");
  await expect(heading).toHaveText(en.join.title);
  await shot(page, "1.1-en");

  await page.locator('input[name="code"]').fill("WRONG-CODE-1");
  await page.locator('input[name="studentNumber"]').fill(STUDENTS.madina.number);
  await joinExam(page, "1.1a");
  await expect(page.getByText(en.join.error.title)).toBeVisible();
  await shotInEveryLanguage(page, "1.1a");

  await page.locator('input[name="code"]').fill(fixture.code);
  await joinExam(page, "1.2");
});

test("1.2, 1.3 and 1.4: system check, the card match and the rules", async () => {
  const { page } = madina;
  evidence.checkAgainPresses = await passSystemCheck(page);
  await shotInEveryLanguage(page, "1.2");

  // E.3, the app's side: Üki Lock asks to pair, the relay makes a code, the card shows it until the
  // Lock confirms it. The Lock's hello names the joined student for its popup.
  const lock = await connectFakeLock();
  try {
    const hello = await lock.next("hello");
    expect(hello.student_name).toBe(STUDENTS.madina.fullName);
    lock.send({ type: "pair.request" });
    const { code } = await lock.next("pair.code");
    const card = page.getByRole("dialog", { name: en.pair.card.title });
    await expect(card).toContainText(`${code.slice(0, 3)} ${code.slice(3)}`);
    await expect(card).toContainText(fixture.title);
    await shotInEveryLanguage(page, "E.3-app");
    lock.send({ type: "pair.confirm", code });
    await lock.next("pair.ok");
    await expect(card).toBeHidden();
    evidence.pairing = { code: "6 digits", helloStudent: hello.student_name, paired: true };
  } finally {
    lock.close();
  }
  await button(page, en.action.continue).click();
  await waitForFrame(page, "1.3");
  await shot(page, "1.3-checking-en");
  const started = Date.now();
  await expect(button(page, en.action.continue)).toBeEnabled({ timeout: 120_000 });
  evidence.identity = { matchedAfterMs: Date.now() - started };
  await shotInEveryLanguage(page, "1.3");
  await button(page, en.action.continue).click();
  await waitForFrame(page, "1.4");
  await shotInEveryLanguage(page, "1.4");
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  const session = await until(
    () => sessionOf(fixture, STUDENTS.madina.number),
    (s) => s?.state === "ready",
    90_000,
    "session ready on the server",
  );
  sessionId = session?.id ?? "";
  const { events } = await recordOf(sessionId);
  const matched = events.find((e) => e.type === "identity.matched");
  expect(matched, "identity.matched reached the server").toBeTruthy();
  evidence.identity = { ...evidence.identity, event: matched?.data };
});

test("2.1: Start exam from the lead proctor opens the exam", async () => {
  const { page, app } = madina;
  const seen = await armFrameWatch(page, "2.1");
  const issued = await startExam(fixture);
  const at = await seen();
  evidence.latencyMs.start = at - issued.sentAt;
  await expect(choice(page, 0)).toBeVisible({ timeout: 30_000 });
  // The exam holds the app: quit is refused until 3.1 (lockdown, or its screenless stand-in).
  const quit = await page.evaluate(() =>
    (window as unknown as { uki: { app: { quit(): Promise<void> } } }).uki.app.quit().then(
      () => "quit",
      (error: unknown) => String(error),
    ),
  );
  expect(quit).toContain("refused");
  if (KIOSK) {
    const kiosk = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isKiosk() ?? false,
    );
    expect(kiosk).toBe(true);
  }
  await shotInEveryLanguage(page, "2.1");
});

test("2.1: answers stay on the laptop and reach the server", async () => {
  const { page } = madina;
  for (let i = 0; i < 4; i += 1) await answerAndNext(page, i % 4);
  const { answers } = await allSynced(page);
  const server = await recordOf(sessionId);
  expect(answers.length).toBe(4);
  expect(server.answers.map((a) => `${a.question_id}:${a.choice_id}`).sort()).toEqual(
    answers.map((a) => `${a.questionId}:${a.choiceId}`).sort(),
  );
});

test("2.1a: a network cut loses nothing and duplicates nothing", async () => {
  const { page, app } = madina;
  const context = app.context();
  // Every network request that still completed during the cut (there should be none), and the
  // frame on screen each second, for the evidence.
  const leaked: string[] = [];
  const frames: string[] = [];
  let cutting = true;
  const onFinished = (request: { url(): string }) => {
    const url = request.url();
    if (cutting && /^https?:/.test(url)) leaked.push(`${Date.now() - cutAt} ${url}`);
  };
  page.on("requestfinished", onFinished);
  const cutAt = Date.now();
  await context.setOffline(true);
  const sampler = setInterval(() => {
    void currentFrame(page).then((frame) => {
      const line = `${Math.round((Date.now() - cutAt) / 1000)}s ${frame}`;
      if (frames.at(-1)?.split(" ")[1] !== frame) frames.push(line);
    });
  }, 1000);
  await waitForFrame(page, "2.1a", 30_000);
  const bannerAfterMs = Date.now() - cutAt;
  await shotInEveryLanguage(page, "2.1a");
  // Five more answers and a changed one, all while offline.
  for (let i = 0; i < 5; i += 1) await answerAndNext(page, (i + 1) % 4);
  await button(page, en.exam.back).click();
  await choice(page, 3).click();
  await button(page, en.exam.next).click();
  const queuedAnswers = (await outboxRows<OutboxAnswer>(page, "answers")).filter((a) => a.syncedAt === null);
  expect(queuedAnswers.length).toBeGreaterThanOrEqual(5);
  const left = OFFLINE_S * 1000 - (Date.now() - cutAt);
  if (left > 0) await page.waitForTimeout(left);
  expect(await currentFrame(page)).toBe("2.1a");
  // What waits on the laptop at the end of the cut.
  const waitingAnswers = (await outboxRows<OutboxAnswer>(page, "answers")).filter((a) => a.syncedAt === null);
  const waitingEvents = (await outboxRows<OutboxEvent>(page, "events")).filter((e) => e.storedAt === null);
  expect(waitingEvents.length).toBeGreaterThan(0);
  cutting = false;
  clearInterval(sampler);
  page.off("requestfinished", onFinished);
  const backAt = Date.now();
  await context.setOffline(false);
  await waitForFrame(page, "2.1", 60_000);
  const recoveredAfterMs = Date.now() - backAt;
  const local = await allSynced(page);
  const syncedAfterMs = Date.now() - backAt;
  const server = await recordOf(sessionId);

  // Answers: the server holds exactly the laptop's, the later change included.
  const localAnswers = local.answers.map((a) => `${a.questionId}:${a.choiceId}`).sort();
  expect(server.answers.map((a) => `${a.question_id}:${a.choice_id}`).sort()).toEqual(localAnswers);
  for (const waiting of waitingAnswers) {
    expect(server.answers.some((a) => a.question_id === waiting.questionId)).toBe(true);
  }
  // Events: each one queued during the cut arrived exactly once, and the session's app events run
  // seq 0, 1, 2, ... with no gap (nothing lost) and no repeat (nothing duplicated). The outbox deletes
  // an event once the server has it, so the laptop keeps only what is still waiting.
  const appEvents = server.events.filter((e) => e.source === "app");
  const serverIds = appEvents.map((e) => e.id);
  expect(new Set(serverIds).size).toBe(serverIds.length);
  for (const waiting of waitingEvents) expect(serverIds.filter((id) => id === waiting.id)).toHaveLength(1);
  expect(local.events.filter((e) => e.storedAt === null)).toHaveLength(0);
  const seqs = appEvents.map((e) => e.seq ?? -1).sort((a, b) => a - b);
  expect(seqs).toEqual(seqs.map((_, i) => i));
  // The cut's own net.offline is the longest spell; a short one may follow when the first calls after
  // the network returns wait over 5 s (a cold Edge Function on this laptop), and is kept as evidence.
  const offlineEvents = appEvents.filter((e) => e.type === "net.offline");
  const spellMs = (e: (typeof offlineEvents)[number]) => (e.data as { offline_ms?: number }).offline_ms ?? 0;
  const offline = [...offlineEvents].sort((a, b) => spellMs(b) - spellMs(a))[0];
  const data = offline?.data as { offline_ms: number; queued: number };
  evidence.offline = {
    cutSeconds: OFFLINE_S,
    bannerAfterMs,
    queuedAnswers: queuedAnswers.length,
    recoveredAfterMs,
    syncedAfterMs,
    answersLocal: local.answers.length,
    answersServer: server.answers.length,
    answersWaitingAtReconnect: waitingAnswers.length,
    eventsWaitingAtReconnect: waitingEvents.length,
    appEventsServer: appEvents.length,
    seqRange: [seqs[0], seqs.at(-1)],
    duplicates: serverIds.length - new Set(serverIds).size,
    netOffline: data,
    netOfflineEvents: offlineEvents.map((e) => e.data),
    framesDuringCut: frames,
    requestsThroughDuringCut: leaked,
  };
  expect(leaked, "no request got through the cut").toEqual([]);
  expect(offline, "net.offline reached the server").toBeTruthy();
  expect(data.offline_ms).toBeGreaterThanOrEqual((OFFLINE_S - 6) * 1000);
});

test("2.1c: the proctor pauses and resumes", async () => {
  const { page } = madina;
  await timeCommand(page, "2.1c", { session_id: sessionId, type: "pause", payload: {} }, "pause");
  // by_name: the lead proctor who pressed Pause.
  await expect(page.getByText(fixture.lead.name).first()).toBeVisible();
  await shotInEveryLanguage(page, "2.1c");
  await timeCommand(page, "2.1", { session_id: sessionId, type: "resume", payload: {} }, "resume");
});

test("2.1e: a message and added time", async () => {
  const { page } = madina;
  await timeCommand(
    page,
    "2.1e",
    {
      session_id: sessionId,
      type: "message",
      payload: { preset: "message.preset.phones_away", scope: "student" },
    },
    "message",
  );
  await expect(page.getByText(en.message.preset.phones_away)).toBeVisible();
  await shotInEveryLanguage(page, "2.1e");
  await button(page, en.message.ack).click();
  await waitForFrame(page, "2.1");
  await timeCommand(
    page,
    "2.1e",
    { session_id: sessionId, type: "add_time", payload: { minutes: 10, scope: "student" } },
    "add_time",
  );
  await shot(page, "2.1e-time-en");
  await button(page, en.message.ack).click();
  await waitForFrame(page, "2.1");
  const session = await until(
    () => sessionOf(fixture, STUDENTS.madina.number),
    (s) => s?.extra_min === 10,
    90_000,
    "extra_min on the server",
  );
  expect(session?.extra_min).toBe(10);
});

test("2.2: a phone in view shows the warning and flags it with stills", async () => {
  const { page } = madina;
  const shownAt = Date.now();
  const seen = await armFrameWatch(page, "2.2");
  await setScene(page, { subject: "phone" });
  const samples = await sampleDetection(page, 4000);
  evidence.phone = {
    examPhoneScore: PHONE_SCORE,
    scores: samples.map((s) => s.phoneScore ?? 0),
    phoneMs: samples.map((s) => s.phoneMs),
    phoneChecksPerS: samples.map((s) => s.phoneChecksPerS),
    fps: samples.map((s) => s.fps),
    rulesPaused: samples.some((s) => s.paused),
  };
  const warningAt = await Promise.race([
    seen(),
    new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error("2.2 did not show in 30 s")), 30_000),
    ),
  ]).catch(async (error: unknown) => {
    evidence.phone = {
      ...evidence.phone,
      eventsOnServer: (await recordOf(sessionId)).events.map((e) => e.type),
    };
    throw error;
  });
  const warningAfterMs = warningAt - shownAt;
  await waitForFrame(page, "2.2", 5000).catch(() => {});
  if ((await currentFrame(page)) === "2.2") await shotInEveryLanguage(page, "2.2");
  await setScene(page, { subject: "present" });
  await waitForFrame(page, "2.1", 20_000);
  const record = await until(
    () => serverRecord(fixture, sessionId),
    (r) => r.events.some((e) => e.type === "phone.detected"),
    90_000,
    "phone.detected on the server",
  );
  const phone = record.events.find((e) => e.type === "phone.detected");
  expect(phone?.review).toBe("flag");
  expect(phone?.frame_count).toBe(3);
  // The three stills went up through the signed URLs and `frames` confirmed them.
  const stills = await until(
    () => framesOf(fixture, phone?.id ?? ""),
    (rows) => rows.length === 3,
    90_000,
    "three confirmed stills",
  );
  expect(stills.every((row) => row.storage_path.startsWith(`${fixture.examId}/`))).toBe(true);
  evidence.phone = {
    stillsConfirmed: stills.length,
    ...evidence.phone,
    warningAfterMs,
    review: phone?.review,
    data: phone?.data,
    frameCount: phone?.frame_count,
  };
});

test("2.3: no face pauses the exam and I'm here resumes it", async () => {
  const { page } = madina;
  await setScene(page, { subject: "absent" });
  await waitForFrame(page, "2.3", 30_000);
  await setScene(page, { subject: "present" });
  const resume = button(page, en.exam.paused.resume);
  await expect(resume).toBeEnabled({ timeout: 15_000 });
  await shotInEveryLanguage(page, "2.3");
  await resume.click();
  await waitForFrame(page, "2.1", 15_000);
  const record = await until(
    () => serverRecord(fixture, sessionId),
    (r) => r.events.some((e) => e.type === "session.resumed"),
    90_000,
    "session.resumed on the server",
  );
  const paused = record.events.find((e) => e.type === "session.paused");
  expect((paused?.data as { reason?: string } | undefined)?.reason).toBe("face_missing");
  expect(record.events.some((e) => e.type === "face.missing")).toBe(true);
});

test("3.1: submit gives the receipt, saves it as a PDF and lets the student close Üki", async () => {
  const { page, app } = madina;
  while (!(await button(page, en.exam.submit).isVisible())) await button(page, en.exam.next).click();
  await choice(page, 0).click();
  await button(page, en.exam.submit).click();
  await waitForFrame(page, "3.1", 60_000);
  const session = await until(
    () => sessionOf(fixture, STUDENTS.madina.number),
    (s) => s?.state === "submitted" && typeof s.receipt_id === "string",
    90_000,
    "submitted on the server",
  );
  const receiptId = session?.receipt_id ?? "";
  expect(receiptId).toMatch(RECEIPT_ID_PATTERN);
  await expect(page.getByText(receiptId)).toBeVisible();
  await shotInEveryLanguage(page, "3.1");

  // Save receipt: the save dialog answers with a temporary path.
  const pdf = join(tmpdir(), `uki-e2e-receipt-${Date.now()}.pdf`);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog;
  }, pdf);
  await button(page, en.done.save).click();
  await until(
    async () => {
      try {
        return statSync(pdf).size;
      } catch {
        return 0;
      }
    },
    (size) => size > 1000,
    90_000,
    "receipt PDF written",
  );
  evidence.receipt = { receiptId, pdfBytes: statSync(pdf).size, timeUsedS: session?.time_used_s };
  rmSync(pdf, { force: true });

  // The outbox empties once the server has everything, and Close Üki quits.
  await until(
    async () =>
      (await outboxRows<OutboxAnswer>(page, "answers")).length +
      (await outboxRows<OutboxEvent>(page, "events")).length,
    (rows) => rows === 0,
    90_000,
    "outbox cleared",
  );
  const exited = new Promise<void>((resolve) => app.process().once("exit", () => resolve()));
  await button(page, en.done.close).click();
  await exited;
});

test("2.1d: the proctor ends a second student's exam", async () => {
  const arman = await launchApp("arman");
  try {
    await checkInLate(arman, STUDENTS.arman.number);
    const { page } = arman;
    await expect(choice(page, 0)).toBeVisible({ timeout: 30_000 });
    const session = await until(
      () => sessionOf(fixture, STUDENTS.arman.number),
      (s) => s?.state === "writing",
      90_000,
      "second session writing",
    );
    const seen = await armFrameWatch(page, "2.1d");
    const issued = await command(fixture, {
      session_id: session?.id,
      type: "end",
      payload: { reason: "Phone used after a warning." },
    });
    const end = (await seen()) - issued.sentAt;
    evidence.latencyMs.end = end;
    await expect(page.getByText(/UKI-/).first()).toBeVisible({ timeout: 30_000 });
    await shotInEveryLanguage(page, "2.1d");
    const ended = await until(
      () => sessionOf(fixture, STUDENTS.arman.number),
      (s) => s?.state === "ended",
      90_000,
      "ended on the server",
    );
    expect(ended?.receipt_id ?? "").toMatch(RECEIPT_ID_PATTERN);
  } catch (error) {
    writeFileSync(join(RESULTS, "arman.log"), arman.logs.join("\n"));
    throw error;
  } finally {
    await arman.close();
  }
});

test("exit criterion 7: every proctor command reached the screen within 1 s", () => {
  // Measured above from just before the proctor's request left to the frame appearing in the window;
  // checked here, last, so one slow command does not stop the rest of the path from running.
  for (const label of ["pause", "resume", "message", "add_time", "end"]) {
    const latency = evidence.latencyMs[label];
    expect.soft(latency, `${label} measured`).toBeDefined();
    expect.soft(latency ?? Number.POSITIVE_INFINITY, `${label} within 1 s`).toBeLessThan(COMMAND_BUDGET_MS);
  }
});

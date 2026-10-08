// WP 1.6 Ask proctor on the dashboard (docs/phase-1-plan.md, Testing: "a help request arriving on 2.4d"):
// two proctors of one exam watch the wall; students ask through ingest as the app does; the Requests
// badge and 2.4d follow the `help` broadcast on both walls; Reply sends a message command; Mark done on
// one wall clears the request on the other. Also measures request -> 2.4d on the host clock (the event's
// `at` to the badge change in each page, stamped by a MutationObserver), over 20 or more requests.
import { writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { signIn, waitForWallSubscribed } from "./support/dashboard.ts";
import { badgeMark, badgeReached, installBadgeRecorder } from "./support/help-recorder.ts";
import { message } from "./support/messages.ts";
import { STAFF } from "./support/seed.ts";
import { describeLatency, summarize } from "./support/stats.ts";
import { draft, ingest } from "./support/student.ts";
import { adminClient, staffClient, userIdsByEmail } from "./support/supabase.ts";
import { createWallFixture, type WallFixture } from "./support/wall-fixture.ts";

/** The plan's bar: a request reaches 2.4d within 1 s at p95 (judged on the cloud project). */
const HELP_BUDGET_MS = 1000;
/** Requests timed for the latency figures (the task asks for at least 20). */
const SAMPLES = Number(process.env.UKI_E2E_HELP_SAMPLES ?? 24);

/**
 * The page clock minus this process's clock, from the round trip with the smallest delay of 10 (both
 * read the host's clock, so this should be about 0; it is logged so the figures can be trusted).
 */
async function clockSkew(page: Page): Promise<{ skewMs: number; roundTripMs: number }> {
  let best = { skewMs: 0, roundTripMs: Number.POSITIVE_INFINITY };
  for (let i = 0; i < 10; i += 1) {
    const before = Date.now();
    const pageNow = await page.evaluate(() => Date.now());
    const after = Date.now();
    if (after - before < best.roundTripMs) {
      best = { skewMs: pageNow - (before + after) / 2, roundTripMs: after - before };
    }
  }
  return best;
}

function requestsButton(page: Page) {
  return page.locator("[data-help-count]");
}

async function openWall(browser: Browser, email: string, fixture: WallFixture): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  const subscribed = waitForWallSubscribed(page, fixture.examId);
  await page.goto(`/exams/${fixture.examId}/live`);
  await subscribed;
  await installBadgeRecorder(page);
  return page;
}

test("2.4d: requests reach both proctors' walls; Reply sends a message, Mark done clears every wall", async ({
  browser,
}, testInfo) => {
  const ids = await userIdsByEmail([STAFF.aigerim, STAFF.gulnara]);
  const aigerimId = ids.get(STAFF.aigerim);
  const gulnaraId = ids.get(STAFF.gulnara);
  if (aigerimId === undefined || gulnaraId === undefined) {
    throw new Error("e2e: the proctors have no auth users; run pnpm seed:staff");
  }
  const fixture = await createWallFixture({ proctorId: aigerimId, moreProctorIds: [gulnaraId], students: 3 });
  const admin = adminClient();
  try {
    await fixture.heartbeat(1);
    const aigerim = await openWall(browser, STAFF.aigerim, fixture);
    const gulnara = await openWall(browser, STAFF.gulnara, fixture);
    const [madina, arman, third] = fixture.students;
    if (madina === undefined || arman === undefined || third === undefined)
      throw new Error("e2e: 3 students");

    // ---- Latency: request -> the Requests badge on both walls, one request at a time ----
    const proctor = await staffClient(STAFF.aigerim);
    const samples: { id: string; atMs: number; aigerimMs: number; gulnaraMs: number }[] = [];
    try {
      // One warm-up request first, not counted: the first call after the functions start pays for a
      // cold isolate (about 2 s locally), which is not what a proctor sees during an exam.
      for (let i = -1; i < SAMPLES; i += 1) {
        const student = fixture.students[Math.max(0, i) % fixture.students.length] ?? madina;
        const marks = await Promise.all([badgeMark(aigerim), badgeMark(gulnara)]);
        const { sent } = await ingest(student, [
          draft("student.help_requested", {
            topic: i % 2 === 0 ? "question" : "break",
            text: `Sample ${i + 1}`,
          }),
        ]);
        const event = sent[0];
        if (event === undefined) throw new Error("e2e: ingest sent nothing");
        const [seenA, seenB] = await Promise.all([
          badgeReached(aigerim, 1, marks[0]),
          badgeReached(gulnara, 1, marks[1]),
        ]);
        if (i >= 0)
          samples.push({
            id: event.id,
            atMs: event.atMs,
            aigerimMs: seenA - event.atMs,
            gulnaraMs: seenB - event.atMs,
          });
        // Mark done through the RPC as the proctor, so the next sample starts from no open request.
        const { data: open } = await admin
          .from("help_requests")
          .select("id")
          .eq("event_id", event.id)
          .single();
        if (!open) throw new Error("e2e: no help request for the event");
        const closing = await Promise.all([badgeMark(aigerim), badgeMark(gulnara)]);
        const closed = await proctor.client.rpc("close_help_request", { id: open.id });
        if (closed.error) throw new Error(`e2e: close_help_request: ${closed.error.message}`);
        await Promise.all([badgeReached(aigerim, 0, closing[0]), badgeReached(gulnara, 0, closing[1])]);
      }
    } finally {
      await proctor.client.auth.signOut();
    }
    const skew = { aigerim: await clockSkew(aigerim), gulnara: await clockSkew(gulnara) };
    console.log(`e2e: page clock minus test clock: ${JSON.stringify(skew)}`);
    const both = summarize(samples.flatMap((s) => [s.aigerimMs, s.gulnaraMs]));
    const first = summarize(samples.map((s) => s.aigerimMs));
    const second = summarize(samples.map((s) => s.gulnaraMs));
    console.log(describeLatency("e2e: help request at -> Requests badge (both walls)", both));
    console.log(describeLatency("e2e: help request at -> Requests badge (lead proctor)", first));
    console.log(describeLatency("e2e: help request at -> Requests badge (second proctor)", second));
    const reportPath = testInfo.outputPath("help-latency.json");
    writeFileSync(reportPath, JSON.stringify({ both, first, second, skew, samples }, null, 2));
    await testInfo.attach("help-latency.json", { path: reportPath, contentType: "application/json" });
    expect(both.n).toBeGreaterThanOrEqual(40);
    expect(both.p95, "request -> 2.4d p95").toBeLessThan(HELP_BUDGET_MS);

    // ---- 2.4d with two open requests, on both walls ----
    await ingest(madina, [
      draft("student.help_requested", { topic: "question", text: "Q 8: radians or degrees?" }),
    ]);
    await ingest(arman, [draft("student.help_requested", { topic: "technical" })]);
    const label = (count: number) => message("dashboard.wall.help.button").replace("{count}", String(count));
    for (const page of [aigerim, gulnara]) {
      await expect(requestsButton(page)).toHaveText(label(2));
      await expect(page.locator(`[data-session-id="${madina.sessionId}"]`)).toContainText("raised hand");
    }
    // A wall opened while requests are open reads them on the server: one help.read audit row per load.
    const audits = async () =>
      (
        await admin
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .eq("action", "help.read")
          .eq("object_id", fixture.examId)
      ).count ?? 0;
    const before = await audits();
    const resubscribed = waitForWallSubscribed(gulnara, fixture.examId);
    await gulnara.reload();
    await resubscribed;
    await expect(requestsButton(gulnara)).toHaveText(label(2));
    expect(await audits()).toBe(before + 1);

    await requestsButton(aigerim).click();
    const popover = aigerim.getByRole("dialog");
    await expect(popover.getByRole("listitem")).toHaveCount(2);
    await expect(popover).toContainText("“Q 8: radians or degrees?”");
    await expect(popover).toContainText("Question is unclear");
    await expect(popover).toContainText("Technical problem");

    // ---- Reply on the lead proctor's wall: a message command for Madina, and the request is done ----
    const madinaRow = popover.getByRole("listitem").filter({ hasText: "radians or degrees" });
    await madinaRow.getByRole("button", { name: message("dashboard.wall.help.reply") }).click();
    const reply = aigerim.getByRole("dialog", { name: message("dashboard.wall.help.reply") });
    await reply.getByLabel(message("dashboard.wall.message.field")).fill("Radians.");
    await reply.getByRole("button", { name: message("dashboard.wall.message.send") }).click();
    await expect(reply).toBeHidden();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("session_commands")
            .select("type, payload, issued_by")
            .eq("session_id", madina.sessionId);
          return data ?? [];
        },
        { timeout: 15_000 },
      )
      .toEqual([{ type: "message", payload: { text: "Radians.", scope: "student" }, issued_by: aigerimId }]);
    // The closing reaches the second proctor's wall too.
    for (const page of [aigerim, gulnara]) await expect(requestsButton(page)).toHaveText(label(1));

    // ---- Mark done on the second proctor's wall clears the badge on the lead proctor's ----
    await requestsButton(gulnara).click();
    await gulnara
      .getByRole("dialog")
      .getByRole("button", { name: message("dashboard.wall.help.done") })
      .click();
    for (const page of [aigerim, gulnara]) await expect(requestsButton(page)).toHaveCount(0);
    const { data: arms } = await admin
      .from("help_requests")
      .select("reply, done_by")
      .eq("session_id", arman.sessionId)
      .eq("topic", "technical");
    expect(arms).toEqual([{ reply: null, done_by: gulnaraId }]);
    const { count: armanCommands } = await admin
      .from("session_commands")
      .select("id", { count: "exact", head: true })
      .eq("session_id", arman.sessionId);
    expect(armanCommands).toBe(0);
    await aigerim.context().close();
    await gulnara.context().close();
  } finally {
    await fixture.destroy();
  }
});

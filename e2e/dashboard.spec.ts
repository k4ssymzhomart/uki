// The dashboard smoke test (plan, Testing and quality gates: sign-in, the live wall updating from
// injected events, a pause command reaching session_commands), plus who sees which exam. Runs against
// the local stack with the seeded KRU world; the wall test builds its own live exam and removes it.
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  examRow,
  examRows,
  pageStatus,
  signIn,
  waitForWallSubscribed,
  wallTile,
} from "./support/dashboard.ts";
import { message, prefix } from "./support/messages.ts";
import { ALL_EXAMS, EXAMS, STAFF } from "./support/seed.ts";
import { describeLatency, summarize } from "./support/stats.ts";
import { draft, ingest } from "./support/student.ts";
import { adminClient, staffClient, userIdsByEmail } from "./support/supabase.ts";
import { examChannel, examRowCounts } from "./support/visibility.ts";
import { createWallFixture } from "./support/wall-fixture.ts";
import {
  frameTimes,
  installSocketRecorder,
  installWallRecorder,
  tileChangeCount,
  waitForTileChange,
} from "./support/wall-recorder.ts";

/** The plan's bar for the wall: an event on the laptop shows on the proctor's screen within 1 s. */
const WALL_BUDGET_MS = 1000;

test.describe("sign-in and exam visibility", () => {
  test("a visitor is sent to sign-in, and the exam office sees every seeded exam", async ({ page }) => {
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.signIn.title"), exact: true }),
    ).toBeVisible();

    await signIn(page, STAFF.dana);
    for (const exam of ALL_EXAMS) {
      await expect(examRow(page, exam.title), exam.title).toHaveCount(1);
    }
  });

  test("a lead proctor sees only the exams assigned to them", async ({ page }) => {
    await signIn(page, STAFF.aigerim);
    // Proctors land on 0.9 (WP 1.5); the overview's exams table still lists only their exams.
    await expect(page).toHaveURL(/\/my-exams$/);
    await page.goto("/overview");
    await expect(examRow(page, EXAMS.math2.title)).toHaveCount(1);
    for (const exam of [EXAMS.physics1, EXAMS.history, EXAMS.linearAlgebra, EXAMS.english]) {
      await expect(examRow(page, exam.title), exam.title).toHaveCount(0);
    }
    // Every visible row is one of hers: the seeded Mathematics 2 or a throwaway exam she leads.
    const ids = await userIdsByEmail([STAFF.aigerim]);
    const { data: assigned } = await adminClient()
      .from("proctor_assignments")
      .select("exams(title)")
      .eq("staff_id", ids.get(STAFF.aigerim) ?? "");
    const titles = new Set((assigned ?? []).map((row) => row.exams?.title));
    for (const text of await examRows(page).locator("td:first-child").allInnerTexts()) {
      expect(
        [...titles].some((title) => title !== undefined && text.includes(title)),
        text,
      ).toBe(true);
    }

    for (const path of [`/exams/${EXAMS.physics1.id}/live`, `/exams/${EXAMS.physics1.id}/lobby`]) {
      expect(await pageStatus(page, path), path).toBe(404);
    }
  });

  test("a proctor of another exam sees nothing of Mathematics 2", async ({ page }) => {
    await signIn(page, STAFF.gulnara);
    await page.goto("/overview");
    await expect(examRow(page, EXAMS.physics1.title)).toHaveCount(1);
    await expect(examRow(page, EXAMS.math2.title)).toHaveCount(0);
    for (const path of [`/exams/${EXAMS.math2.id}/live`, `/exams/${EXAMS.math2.id}/lobby`]) {
      expect(await pageStatus(page, path), path).toBe(404);
    }

    // The same through the API: no rows under RLS, and Realtime refuses exam:{Mathematics 2}.
    const gulnara = await staffClient(STAFF.gulnara);
    try {
      const counts = await examRowCounts(gulnara.client, EXAMS.math2.id);
      expect(counts).toEqual({
        exams: 0,
        exam_overview: 0,
        exam_groups: 0,
        exam_students: 0,
        proctor_assignments: 0,
        sessions: 0,
        events: 0,
        frames: 0,
        session_commands: 0,
      });
      // Her own exam first, as the control: Realtime lets her in there.
      const own = await examChannel(gulnara.client, EXAMS.physics1.id);
      expect(own.status, own.error ?? "").toBe("SUBSCRIBED");
      const refused = await examChannel(gulnara.client, EXAMS.math2.id);
      expect(refused.status, refused.error ?? "").toBe("CHANNEL_ERROR");
      expect(refused.error).toMatch(/unauthorized/i);
    } finally {
      await gulnara.client.removeAllChannels();
      await gulnara.client.auth.signOut();
    }
  });
});

test("the live wall follows injected events within 1 s, and Pause exam reaches session_commands", async ({
  page,
}, testInfo) => {
  const aigerimId = (await userIdsByEmail([STAFF.aigerim])).get(STAFF.aigerim);
  if (aigerimId === undefined) throw new Error("e2e: Aigerim has no auth user; run pnpm seed:staff");
  const fixture = await createWallFixture({ proctorId: aigerimId, students: 3 });
  try {
    await installSocketRecorder(page);
    await signIn(page, STAFF.aigerim);
    const subscribed = waitForWallSubscribed(page, fixture.examId);
    await page.goto(`/exams/${fixture.examId}/live`);
    await subscribed;
    for (const student of fixture.students) await expect(wallTile(page, student.sessionId)).toBeVisible();

    const [target] = fixture.students;
    if (target === undefined) throw new Error("e2e: the fixture has no students");
    const tile = wallTile(page, target.sessionId);
    await fixture.heartbeat(1);
    await expect(tile).toHaveAttribute("data-wall-state", "on_screen");
    await expect(tile).toContainText(prefix("dashboard.wall.tile.onScreen", { question: 1 }));
    await installWallRecorder(page);

    // Looks away five times (warning, counting up), then a phone (flagged): each changes the tile.
    const samples: { id: string; type: string; atMs: number; tileAt: number; ms: number; text: string }[] =
      [];
    const steps = [
      ...[1, 2, 3, 4, 5].map((count) => ({
        event: draft("gaze.off_screen", { duration_ms: 2400, direction: count % 2 === 0 ? "right" : "left" }),
        state: "warning",
        text:
          count === 1
            ? prefix("dashboard.wall.tile.lookedAwayOnce")
            : prefix("dashboard.wall.tile.lookedAway", { count }),
      })),
      {
        event: draft("phone.detected", { score: 0.94, held_ms: 800 }),
        state: "flagged",
        text: prefix("dashboard.wall.tile.phone"),
      },
    ];
    for (const step of steps) {
      const after = await tileChangeCount(page);
      const { sent } = await ingest(target, [step.event]);
      const event = sent[0];
      if (event === undefined) throw new Error("e2e: ingest sent nothing");
      const change = await waitForTileChange(page, {
        sessionId: target.sessionId,
        after,
        state: step.state,
        textIncludes: step.text,
      });
      samples.push({
        id: event.id,
        type: event.type,
        atMs: event.atMs,
        tileAt: change.t,
        ms: change.t - event.atMs,
        text: change.text,
      });
    }
    // Split on the page clock: at -> frame is ingest, the database and Realtime; frame -> tile is the
    // dashboard. Only the end-to-end time is held to the budget.
    const frames = await frameTimes(
      page,
      samples.map((sample) => sample.id),
    );
    const legs = samples.map((sample) => {
      const frame = frames[sample.id];
      return {
        type: sample.type,
        atToFrame: frame === undefined ? null : frame - sample.atMs,
        frameToTile: frame === undefined ? null : sample.tileAt - frame,
      };
    });
    const endToEnd = summarize(samples.map((sample) => sample.ms));
    const serverSide = summarize(legs.flatMap((leg) => (leg.atToFrame === null ? [] : [leg.atToFrame])));
    const dashboard = summarize(legs.flatMap((leg) => (leg.frameToTile === null ? [] : [leg.frameToTile])));
    console.log(describeLatency("e2e: event at -> tile update (through ingest)", endToEnd));
    console.log(describeLatency("e2e: event at -> Realtime frame in the page", serverSide));
    console.log(describeLatency("e2e: Realtime frame -> tile update", dashboard));
    const reportPath = testInfo.outputPath("wall-latency.json");
    writeFileSync(reportPath, JSON.stringify({ endToEnd, serverSide, dashboard, samples, legs }, null, 2));
    await testInfo.attach("wall-latency.json", { path: reportPath, contentType: "application/json" });
    for (const sample of samples) {
      expect(sample.ms, `${sample.type} at to tile: ${sample.text}`).toBeLessThan(WALL_BUDGET_MS);
    }
    // The Live events column lists them too.
    const feed = page.getByRole("region", { name: message("dashboard.wall.feed.title"), exact: true });
    await expect(feed.locator("li")).toHaveCount(steps.length);

    // 2.4a: open the tile menu, Pause exam. The command function writes the session_commands row and
    // the proctor.paused event, which pauses the session and the tile.
    await tile.click();
    await page.getByRole("menuitem", { name: message("dashboard.wall.action.pause") }).click();
    const admin = adminClient();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("session_commands")
            .select("type, payload, issued_by, exam_id")
            .eq("session_id", target.sessionId);
          return data ?? [];
        },
        { timeout: 15_000 },
      )
      .toEqual([{ type: "pause", payload: {}, issued_by: aigerimId, exam_id: fixture.examId }]);
    await expect(tile).toHaveAttribute("data-wall-state", "paused");
    const { data: session } = await admin
      .from("sessions")
      .select("state")
      .eq("id", target.sessionId)
      .single();
    expect(session?.state).toBe("paused");
  } finally {
    await fixture.destroy();
  }
});

// WP 1.8's done-when on the seeded History of Kazakhstan: its 7 flags (5 sessions) review to
// `reviewed` through Mark reviewed on 2.4a and the decision form on 3.3; a flag that arrives after a
// decision puts the session back in the queue; a note added in 2.5 shows on 3.3. Every read and write
// leaves its audit row. The test restores the seed afterwards: no decisions, no extra events, the exam
// back in `to_review`.
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { pageStatus, signIn, wallTile } from "./support/dashboard.ts";
import { message, prefix } from "./support/messages.ts";
import { EXAMS, STAFF } from "./support/seed.ts";
import { adminClient, cleanUp, userIdsByEmail } from "./support/supabase.ts";

const HISTORY = EXAMS.history.id;
/** The seeded flags' sessions (supabase/seed.sql): seats 7, 21, 33, 48 and 64. */
const FLAGGED_SEATS = [7, 21, 33, 48, 64] as const;
const NOTE = "Phone face down after the warning.";

function historySession(seat: number): string {
  return `d0000000-0000-4000-8003-${String(seat).padStart(12, "0")}`;
}

/** The rows of the queue table on 3.2 (Row/Session carries the session id). */
function queueRows(page: Page) {
  return page.locator("tr[data-session-id]");
}

async function examStatus(): Promise<string | undefined> {
  const { data } = await adminClient().from("exams").select("status").eq("id", HISTORY).single();
  return data?.status;
}

async function decidedSessions(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("review_decisions")
    .select("session_id")
    .eq("exam_id", HISTORY);
  if (error) throw new Error(`e2e: reading decisions failed: ${error.message}`);
  return (data ?? []).map((row) => row.session_id).sort();
}

const added: string[] = [];
let startedAt = "";

async function restoreSeed(): Promise<void> {
  const admin = adminClient();
  await cleanUp("review", [
    ["History's decisions", () => admin.from("review_decisions").delete().eq("exam_id", HISTORY)],
    [
      "notes and flags the test added",
      () =>
        added.length === 0 ? Promise.resolve({ error: null }) : admin.from("events").delete().in("id", added),
    ],
    [
      "proctor notes on History",
      () => admin.from("events").delete().eq("exam_id", HISTORY).eq("type", "proctor.note"),
    ],
    [
      "History back to to_review",
      () => admin.from("exams").update({ status: "to_review" }).eq("id", HISTORY),
    ],
  ]);
}

test.beforeAll(async () => {
  startedAt = new Date().toISOString();
  // A run that stopped half-way must not leave decisions that hide the queue.
  await restoreSeed();
});

test.afterAll(async () => {
  await restoreSeed();
});

test("History of Kazakhstan's 7 flags review to reviewed; a new flag reopens a session; 2.5's note shows on 3.3", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await signIn(page, STAFF.dana);
  const [danaId] = [...(await userIdsByEmail([STAFF.dana])).values()];

  // 3.2: five sessions, seven flags, and Review's count in the sidebar.
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { level: 1, name: message("dashboard.review.title") }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: `${prefix("dashboard.review.tab.to_review")}5` }),
  ).toBeVisible();
  await expect(queueRows(page)).toHaveCount(5);
  await expect(page.getByText(`7 flags in total`)).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: /Review/ })).toContainText("5");

  // 3.2a: the filter narrows the queue through ?flag=.
  await page.getByRole("button", { name: /Flag type/ }).click();
  await page.getByRole("checkbox", { name: "Phone in frame" }).click();
  await page.getByRole("button", { name: "Show 2 flags" }).click();
  await expect(queueRows(page)).toHaveCount(2);
  await expect(page).toHaveURL(/\?flag=phone\.detected$/);
  await page.goto("/review");
  await expect(queueRows(page)).toHaveCount(5);

  // 2.5: Add note on Madina's (seat 7) timeline drawer.
  await page.goto(`/exams/${HISTORY}/live?session=${historySession(7)}`);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: message("dashboard.wall.drawer.addNote") }).click();
  await drawer.getByRole("textbox", { name: message("dashboard.wall.drawer.noteLabel") }).fill(NOTE);
  await drawer.getByRole("button", { name: message("dashboard.wall.drawer.addNote") }).click();
  await expect(drawer.getByText(`“${NOTE}”`)).toBeVisible({ timeout: 30_000 });
  const { data: notes } = await adminClient()
    .from("events")
    .select("id, source, review, data")
    .eq("session_id", historySession(7))
    .eq("type", "proctor.note");
  expect(notes).toHaveLength(1);
  expect(notes?.[0]).toMatchObject({
    source: "proctor",
    review: "none",
    data: { text: NOTE, staff_id: danaId },
  });
  added.push(...(notes ?? []).map((row) => row.id));

  // 2.4a: Mark reviewed on seat 33 (its phone flag is on the wall).
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await wallTile(page, historySession(33)).click();
  await page.getByRole("menuitem", { name: message("dashboard.wall.action.markReviewed") }).click();
  await expect.poll(decidedSessions, { timeout: 30_000 }).toEqual([historySession(33)]);
  const { data: marked } = await adminClient()
    .from("review_decisions")
    .select("decision, reviewer_id")
    .eq("session_id", historySession(33))
    .single();
  expect(marked).toEqual({ decision: "no_issue", reviewer_id: danaId });

  // 3.3: the note from 2.5 is on Madina's timeline.
  await page.goto(`/review/${historySession(7)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const timeline = page.getByRole("region", { name: message("dashboard.review.session.timeline") });
  await expect(timeline).toContainText(`“${NOTE}”`);

  // 3.3: decide the four left, one after another through Save and next.
  await page.goto("/review");
  await expect(queueRows(page)).toHaveCount(4);
  await queueRows(page)
    .first()
    .getByRole("link", { name: message("dashboard.review.row.review") })
    .click();
  const choices = ["talk", "no_issue", "committee", "no_issue"] as const;
  for (const [index, decision] of choices.entries()) {
    await expect(page).toHaveURL(/\/review\/[0-9a-f-]{36}$/);
    // The decided session leaves the queue, so the next one is always first of those left.
    await expect(page.getByText(new RegExp(`/ 1 of ${choices.length - index}$`))).toBeVisible();
    await page
      .getByRole("radio", { name: message(`dashboard.review.session.decision.${decision}.title`) })
      .click();
    await page
      .getByRole("textbox", { name: message("dashboard.review.session.note") })
      .fill(`e2e ${decision}`);
    await page.getByRole("button", { name: message("dashboard.review.session.save") }).click();
    if (index < choices.length - 1) {
      await expect.poll(async () => (await decidedSessions()).length, { timeout: 30_000 }).toBe(index + 2);
    }
  }
  await expect(page).toHaveURL(/\/review$/, { timeout: 30_000 });
  await expect(page.getByText(message("dashboard.review.empty.to_review"))).toBeVisible();
  expect(await decidedSessions()).toEqual(FLAGGED_SEATS.map(historySession).sort());
  expect(await examStatus()).toBe("reviewed");

  // A flag after the decision puts that session back in the queue; the exam stays reviewed.
  const late = randomUUID();
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from("events")
    .insert({
      id: late,
      session_id: historySession(21),
      exam_id: HISTORY,
      type: "face.second",
      source: "app",
      review: "flag",
      at: now,
      data: { duration_ms: 2000, faces: 2 },
    });
  if (error) throw new Error(`e2e: inserting the late flag failed: ${error.message}`);
  added.push(late);
  await page.goto("/review");
  await expect(queueRows(page)).toHaveCount(1);
  await expect(queueRows(page).first()).toHaveAttribute("data-session-id", historySession(21));
  await expect(queueRows(page).first()).toContainText(message("dashboard.review.status.to_review"));
  await queueRows(page)
    .first()
    .getByRole("link", { name: message("dashboard.review.row.review") })
    .click();
  await page
    .getByRole("radio", { name: message("dashboard.review.session.decision.no_issue.title") })
    .click();
  await page.getByRole("button", { name: message("dashboard.review.session.save") }).click();
  await expect(page).toHaveURL(/\/review$/, { timeout: 30_000 });
  await expect(page.getByText(message("dashboard.review.empty.to_review"))).toBeVisible();

  // Audit rows: the queue and each session opened, every decision and the note, all by Dana.
  const { data: audit, error: auditError } = await adminClient()
    .from("audit_log")
    .select("action, object_type, object_id")
    .eq("actor_id", danaId ?? "")
    .gte("at", startedAt);
  if (auditError) throw new Error(`e2e: reading audit_log failed: ${auditError.message}`);
  const actions = (audit ?? []).map((row) => row.action);
  expect(actions).toContain("review.queue_viewed");
  expect(actions.filter((action) => action === "review.decide").length).toBeGreaterThanOrEqual(6);
  expect(actions).toContain("session.note");
  const viewed = new Set(
    (audit ?? []).filter((row) => row.action === "review.session_viewed").map((row) => row.object_id),
  );
  expect(viewed.has(historySession(7))).toBe(true);
  expect(viewed.has(historySession(21))).toBe(true);
});

test("a proctor reviews only the exams assigned to them", async ({ page }) => {
  // Aigerim proctors Mathematics 2 only; History of Kazakhstan's flags are not hers to see.
  await signIn(page, STAFF.aigerim);
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { level: 1, name: message("dashboard.review.title") }),
  ).toBeVisible();
  await expect(page.locator(`tbody[data-exam-id="${HISTORY}"]`)).toHaveCount(0);
  expect(await pageStatus(page, `/review/${historySession(7)}`)).toBe(404);
});

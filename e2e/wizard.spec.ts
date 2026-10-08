// WP 1.3: the exam office creates and schedules an exam through the wizard (0.4, 0.2 with 0.2a, 0.3
// with 0.3a and 0.3b, 0.5) with demo/roster.csv. The bad rows show on 0.3a and are fixed one by one;
// the clean file imports, and importing it again adds nobody; Aigerim and Nurlan take seats 1 to 12 and
// 13 to 24, an overlap is refused; the test invite goes to Dana only; Schedule exam sends the 24 invites
// through send-invites (WP 1.4) and returns to 0.1 with the code. Timed against the exit criterion
// (under 5 minutes by hand). Then a bounced address is fixed through 0.3b and its invite goes out again,
// and 0.3's Resend sends one invite again. Every email goes to the Resend stub on the port the served
// functions' env file names (readFunctionsEnv), never to Resend. The exam is deleted afterwards.
import { readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { readFunctionsEnv, startResendStub } from "../test/integration/resend-stub.ts";
import { signIn } from "./support/dashboard.ts";
import { ROOT } from "./support/env.ts";
import { message } from "./support/messages.ts";
import { STAFF } from "./support/seed.ts";
import { adminClient } from "./support/supabase.ts";

const DEMO_CSV = `${ROOT}demo/roster.csv`;
const TITLE = "Mathematics 2 · Retake (e2e)";
const m = (key: string) => message(`dashboard.wizard.${key}`);

/** The six fixes the demo makes on 0.3a: row, the field's label, the new value (a select for groups). */
const FIXES = [
  { row: 4, label: "roster.fix.label.student_number", value: "20235004" },
  { row: 9, label: "roster.fix.label.group", value: "204", select: true },
  { row: 10, label: "roster.fix.label.group", value: "204", select: true },
  { row: 14, label: "roster.fix.label.email", value: "20231219@student.kru.test" },
  { row: 17, label: "roster.fix.label.student_number", value: "20235017" },
  { row: 21, label: "roster.fix.label.full_name", value: "Alikhan Utepov" },
] as const;

/** demo/roster.csv with the six fixes applied, for the second import. */
function fixedCsv(path: string): string {
  const lines = readFileSync(DEMO_CSV, "utf8").trimEnd().split("\n");
  const set = (row: number, column: number, value: string) => {
    const cells = (lines[row] as string).split(",");
    cells[column] = value;
    lines[row] = cells.join(",");
  };
  set(4, 0, "20235004");
  set(9, 3, "204");
  set(10, 3, "204");
  set(14, 2, "20231219@student.kru.test");
  set(17, 0, "20235017");
  set(21, 1, "Alikhan Utepov");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

async function chooseOption(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

test("the exam office creates and schedules an exam from the demo roster in under 5 minutes", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const admin = adminClient();
  const functionsEnv = readFunctionsEnv();
  const stub = await startResendStub(functionsEnv.port);
  const inbox = (address: string) => functionsEnv.sink ?? address;
  await signIn(page, STAFF.dana);
  const started = Date.now();

  await page.getByRole("button", { name: m("overview.newExam"), exact: true }).click();
  await page.waitForURL(/\/exams\/[0-9a-f-]{36}\/edit\/details$/, { timeout: 60_000 });
  const examId = /\/exams\/([0-9a-f-]{36})\/edit/.exec(page.url())?.[1] as string;

  try {
    // 0.4: details. Every change saves into the draft.
    await page.getByLabel(m("details.title.label"), { exact: true }).fill(TITLE);
    await page.getByLabel(m("details.course.label"), { exact: true }).fill("Mathematics 2");
    await chooseOption(page, m("details.kind.label"), m("details.kind.midterm"));
    await page.getByRole("button", { name: m("details.groups.add") }).click();
    await page.getByRole("menuitem", { name: /^Group 204 · \d+ students$/ }).click();
    await expect(page.getByText(/^Group 204 · \d+ students$/)).toBeVisible();
    await page.getByRole("button", { name: m("details.next"), exact: true }).click();

    // 0.2 and 0.2a. A refresh keeps a changed check.
    await page.waitForURL(/\/edit\/checks$/);
    await page.getByRole("button", { name: m("checks.gazeThreshold.info") }).click();
    await expect(page.getByText(m("checks.gazeInfo.body"))).toBeVisible();
    await page.keyboard.press("Escape");
    const identity = page.getByRole("switch", { name: m("checks.identity.title") });
    await identity.click();
    await expect
      .poll(async () => (await admin.from("exams").select("checks").eq("id", examId).single()).data?.checks)
      .toMatchObject({ identity: false });
    await page.reload();
    await expect(page.getByRole("switch", { name: m("checks.identity.title") })).not.toBeChecked();
    await page.getByRole("switch", { name: m("checks.identity.title") }).click();
    // Back to 0.4: the title is still there.
    await page.getByRole("button", { name: m("back"), exact: true }).click();
    await page.waitForURL(/\/edit\/details$/);
    await expect(page.getByLabel(m("details.title.label"), { exact: true })).toHaveValue(TITLE);
    await page.getByRole("button", { name: m("details.next"), exact: true }).click();
    await page.waitForURL(/\/edit\/checks$/);
    await page.getByRole("button", { name: m("checks.next"), exact: true }).click();

    // 0.3a: the demo file shows its six bad rows, and nothing is written.
    await page.waitForURL(/\/edit\/roster$/);
    await page.locator('input[type="file"]').setInputFiles(DEMO_CSV);
    const errors = page.getByRole("region", { name: "roster.csv" });
    await expect(errors.getByText("18 of 24 rows are valid. Fix 6 rows or skip them.")).toBeVisible();
    for (const text of [
      "Student ID 2023504 is not 8 digits",
      "Group is empty",
      "Group 240 is not in this university",
      "Email has no @",
      "Student ID 20231044 appears twice",
      "Name is empty",
    ]) {
      await expect(errors.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByText("Fix or skip the 6 rows to continue. Nothing is sent until you schedule."),
    ).toBeVisible();
    expect((await admin.from("exam_students").select("student_id").eq("exam_id", examId)).data).toEqual([]);

    // Edit opens 0.3b's panel for each row; the last fix imports the file.
    for (const fix of FIXES) {
      await errors
        .getByRole("listitem")
        .filter({ hasText: `Row ${fix.row}` })
        .getByRole("button", { name: m("roster.action.edit") })
        .click();
      const panel = page.getByRole("dialog");
      if ("select" in fix) {
        await panel.getByLabel(m(fix.label), { exact: true }).click();
        await page.getByRole("option", { name: `Group ${fix.value}` }).click();
      } else {
        await panel.getByLabel(m(fix.label), { exact: true }).fill(fix.value);
      }
      await panel.getByRole("button", { name: m("save"), exact: true }).click();
      await expect(panel).toBeHidden();
    }
    await expect(page.getByRole("heading", { name: "Students · 24", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("24 of 24 valid", { exact: true })).toBeVisible();

    // Importing the fixed file again adds nobody.
    await page.locator('input[type="file"]').setInputFiles(fixedCsv(testInfo.outputPath("roster-fixed.csv")));
    const imports = async () =>
      (
        await admin
          .from("audit_log")
          .select("meta")
          .eq("action", "roster.import")
          .eq("object_id", examId)
          .order("id")
      ).data?.map((row) => row.meta);
    await expect.poll(imports, { timeout: 30_000 }).toEqual([
      { inserted: 0, updated: 24, seats: 24, removed: 0 },
      { inserted: 0, updated: 24, seats: 24, removed: 0 },
    ]);
    await expect(page.getByRole("heading", { name: "Students · 24", exact: true })).toBeVisible();
    expect((await admin.from("exam_students").select("student_id").eq("exam_id", examId)).data).toHaveLength(
      24,
    );

    // Proctors: Aigerim 1 to 12, Nurlan 13 to 24; an overlap is refused with its seats.
    for (const [name, to] of [
      ["Aigerim Sadykova", "12"],
      ["Nurlan Bekov", "24"],
    ] as const) {
      await page.getByRole("button", { name: m("roster.proctors.add"), exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(m("roster.proctors.dialog.proctor"), { exact: true }).click();
      await page.getByRole("option", { name }).click();
      await dialog.getByLabel(m("roster.proctors.dialog.to"), { exact: true }).fill(to);
      await dialog.getByRole("button", { name: m("save"), exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.getByText("Seats 1–12 · Kazakh, Russian", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit Nurlan Bekov" }).click();
    const edit = page.getByRole("dialog");
    await edit.getByLabel(m("roster.proctors.dialog.from"), { exact: true }).fill("10");
    await edit.getByRole("button", { name: m("save"), exact: true }).click();
    await expect(edit.getByText("Seats 10–12 are given to two proctors.")).toBeVisible();
    await edit.getByRole("button", { name: m("cancel"), exact: true }).click();
    const seats = await admin
      .from("proctor_assignments")
      .select("seat_from, seat_to")
      .eq("exam_id", examId)
      .order("seat_from");
    expect(seats.data).toEqual([
      { seat_from: 1, seat_to: 12 },
      { seat_from: 13, seat_to: 24 },
    ]);

    // 0.5: the summary; the test invite goes to Dana alone and writes nothing.
    await page.getByRole("button", { name: m("roster.next"), exact: true }).click();
    await page.waitForURL(/\/edit\/review$/);
    await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
    await expect(page.getByText("24 invites go out", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: m("review.testInvite"), exact: true }).click();
    await expect(page.getByText(m("review.testInviteSent"), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    expect(stub.batches).toHaveLength(1);
    expect(stub.emails().map((email) => email.to)).toEqual([[inbox(STAFF.dana)]]);
    expect(stub.emails()[0]?.subject).toContain(TITLE);
    const states = async () =>
      ((await admin.from("invites").select("state").eq("exam_id", examId)).data ?? []).map(
        (row) => row.state,
      );
    expect(new Set(await states())).toEqual(new Set(["pending"]));

    // Schedule exam: the code, and the 24 invites through send-invites in one batch.
    await page.getByRole("button", { name: m("review.schedule"), exact: true }).click();
    await page.waitForURL(/\/overview/, { timeout: 60_000 });
    const toast = page.getByText(/^Exam scheduled\. Students join with the code (MATH2-204-[A-Z]{3}\d*)\.$/);
    await expect(toast).toBeVisible();
    const code = /code (\S+)\.$/.exec((await toast.textContent()) ?? "")?.[1];
    const exam = await admin.from("exams").select("status, code").eq("id", examId).single();
    expect(exam.data).toEqual({ status: "scheduled", code });

    const elapsed = Date.now() - started;
    console.log(`e2e: wizard from New exam to the code ${code} in ${(elapsed / 1000).toFixed(1)} s`);
    expect(elapsed).toBeLessThan(5 * 60_000);

    expect(stub.batches).toHaveLength(2);
    const sent = stub.batches[1]?.emails ?? [];
    expect(sent).toHaveLength(24);
    expect(new Set(sent.map((email) => email.to[0]))).toEqual(
      new Set(
        functionsEnv.sink
          ? [functionsEnv.sink]
          : readFileSync(fixedCsv(testInfo.outputPath("roster-sent.csv")), "utf8")
              .trimEnd()
              .split("\n")
              .slice(1)
              .map((line) => line.split(",")[2]),
      ),
    );
    expect(sent.every((email) => email.text.includes(code ?? "-"))).toBe(true);
    expect(await states()).toEqual(Array.from({ length: 24 }, () => "sent"));
    await expect(page.getByText(/did not go out/)).toHaveCount(0);

    // 0.3b on the scheduled exam: Kairat's invite bounced (Resend's webhook is Phase 2, so the test
    // sets it); the new address saves and his invite goes out again to it.
    const kairat = (
      await admin
        .from("exam_students")
        .select("student_id, students!inner(student_number)")
        .eq("exam_id", examId)
        .eq("students.student_number", "20235001")
        .single()
    ).data?.student_id as string;
    await admin
      .from("invites")
      .update({ state: "bounced", error: "The mailbox does not exist." })
      .eq("exam_id", examId)
      .eq("student_id", kairat);
    await page.goto(`/exams/${examId}/edit/roster`);
    const kairatRow = page.getByRole("row").filter({ hasText: "Kairat Kairatov" });
    await expect(kairatRow.getByText(m("roster.invite.bounced"), { exact: true })).toBeVisible();
    await kairatRow.getByRole("button", { name: m("roster.action.fixEmail"), exact: true }).click();
    const fix = page.getByRole("dialog");
    await expect(fix.getByText("Fix Kairat’s email", { exact: true })).toBeVisible();
    await expect(fix.getByText(m("roster.fix.helperScheduled"), { exact: true })).toBeVisible();
    await fix
      .getByLabel(m("roster.fix.label.email"), { exact: true })
      .fill("kairat.kairatov@student.kru.test");
    await fix.getByRole("checkbox", { name: m("roster.fix.roster") }).click();
    await fix.getByRole("button", { name: m("save"), exact: true }).click();
    await expect(fix).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => stub.batches.length, { timeout: 30_000 }).toBe(3);
    expect(stub.batches[2]?.emails.map((email) => email.to)).toEqual([
      [inbox("kairat.kairatov@student.kru.test")],
    ]);
    const fixed = await admin
      .from("invites")
      .select("state, email")
      .eq("exam_id", examId)
      .eq("student_id", kairat)
      .single();
    expect(fixed.data).toEqual({ state: "sent", email: "kairat.kairatov@student.kru.test" });
    await expect(kairatRow.getByText(m("roster.invite.sent"), { exact: true })).toBeVisible();

    // 0.3's Resend: one more email for Aigerim Baimukhanova, nobody else.
    const aigerimRow = page.getByRole("row").filter({ hasText: "Aigerim Baimukhanova" });
    await aigerimRow.getByRole("button", { name: m("roster.action.resend"), exact: true }).click();
    await expect(
      page.getByText("The invite went out again to Aigerim Baimukhanova.", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    expect(stub.batches).toHaveLength(4);
    expect(stub.batches[3]?.emails.map((email) => email.to)).toEqual([[inbox("20235002@student.kru.test")]]);
  } finally {
    await admin.from("exams").delete().eq("id", examId);
    await stub.close();
  }
});

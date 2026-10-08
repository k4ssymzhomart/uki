// WP 1.5 Proctor home and lobby (docs/phase-1-plan.md, Testing: "0.9a"; Demo Day script Act 2 and
// step 5):
// - Nurlan signs in and lands on 0.9 (/my-exams); on Mathematics 2 he first asks for a change (0.9a),
//   which reaches the exam office on 0.1's exam row and in the lobby, then confirms seats 65 to 128.
// - On a lobby, 1.5a opens when the pointer rests on a student's row, and Send hint on 1.5b creates the
//   `message` command, which the student's app receives with its next ingest call.
//
// The seeded Mathematics 2 starts 15 minutes after `supabase db reset`. On a long-running local stack
// it may have started already; the test then moves it back to scheduled for its own run and restores the
// row afterwards, as it restores Nurlan's assignment.
import { expect, type Page, test } from "@playwright/test";
import type { Enums } from "../packages/db/src/index.ts";
import { examRow, signIn } from "./support/dashboard.ts";
import { createLobbyFixture, type LobbyFixture } from "./support/lobby-fixture.ts";
import { message } from "./support/messages.ts";
import { EXAMS, STAFF } from "./support/seed.ts";
import { draft, ingest } from "./support/student.ts";
import { adminClient, userIdsByEmail } from "./support/supabase.ts";

function fill(key: string, values: Record<string, string | number>): string {
  return message(key).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

async function staffId(email: string): Promise<string> {
  const id = (await userIdsByEmail([email])).get(email);
  if (id === undefined) throw new Error(`e2e: ${email} has no auth user; run pnpm seed:staff`);
  return id;
}

type Math2Row = { status: Enums<"exam_status">; starts_at: string; lobby_opens_at: string };
type AssignmentRow = { confirmed_at: string | null; change_request: string | null };

test("0.9: Nurlan lands on My exams, asks for a change that reaches the exam office, then confirms seats 65 to 128", async ({
  page,
  browser,
}) => {
  const admin = adminClient();
  const nurlanId = await staffId(STAFF.nurlan);
  const startedAt = new Date().toISOString();
  const exam = await admin
    .from("exams")
    .select("status, starts_at, lobby_opens_at")
    .eq("id", EXAMS.math2.id)
    .single<Math2Row>();
  if (exam.error) throw new Error(`e2e: reading Mathematics 2 failed: ${exam.error.message}`);
  const assignment = await admin
    .from("proctor_assignments")
    .select("confirmed_at, change_request, seat_from, seat_to")
    .eq("exam_id", EXAMS.math2.id)
    .eq("staff_id", nurlanId)
    .single();
  if (assignment.error)
    throw new Error("e2e: Nurlan's Mathematics 2 assignment is missing; run pnpm seed:staff");
  expect([assignment.data.seat_from, assignment.data.seat_to]).toEqual([65, 128]);
  const original: { exam: Math2Row; assignment: AssignmentRow } = {
    exam: exam.data,
    assignment: {
      confirmed_at: assignment.data.confirmed_at,
      change_request: assignment.data.change_request,
    },
  };
  const rescheduled =
    exam.data.status !== "scheduled" || Date.parse(exam.data.starts_at) <= Date.now() + 60_000;
  const officeContext = await browser.newContext();
  let restoreFailed: string | null = null;

  try {
    if (rescheduled) {
      const startsAt = Math.ceil((Date.now() + 15 * 60_000) / 60_000) * 60_000;
      const moved = await admin
        .from("exams")
        .update({
          status: "scheduled",
          starts_at: new Date(startsAt).toISOString(),
          lobby_opens_at: new Date(startsAt - 20 * 60_000).toISOString(),
        })
        .eq("id", EXAMS.math2.id);
      if (moved.error) throw new Error(`e2e: rescheduling Mathematics 2 failed: ${moved.error.message}`);
    }
    const open = await admin
      .from("proctor_assignments")
      .update({ confirmed_at: null, change_request: null })
      .eq("exam_id", EXAMS.math2.id)
      .eq("staff_id", nurlanId);
    if (open.error) throw new Error(`e2e: re-opening Nurlan's seats failed: ${open.error.message}`);

    // Sign-in lands on 0.9 with the banner and Confirm seats on the Mathematics 2 row.
    await signIn(page, STAFF.nurlan);
    await expect(page).toHaveURL(/\/my-exams$/);
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.myExams.title"), exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(fill("dashboard.myExams.banner.title", { course: "Mathematics 2" })),
    ).toBeVisible();
    const row = page.locator(`tr[data-exam-id="${EXAMS.math2.id}"]`);
    await expect(row).toContainText(fill("dashboard.myExams.seats", { from: 65, to: 128 }));

    // 0.9a, Ask for a change.
    await row.getByRole("button", { name: message("dashboard.myExams.status.confirm") }).click();
    const confirmTitle = fill("dashboard.myExams.confirm.title", { course: "Mathematics 2" });
    const dialog = page.getByRole("dialog", { name: confirmTitle });
    await expect(dialog).toContainText(
      fill("dashboard.myExams.confirm.seats", { from: 65, to: 128 }).split(",")[0] ?? "",
    );
    await dialog.getByRole("button", { name: message("dashboard.myExams.confirm.change") }).click();
    const note = `E2E ${Date.now()}: seats 1–64, please; my Kazakh is better.`;
    await page.getByRole("textbox", { name: message("dashboard.myExams.change.field") }).fill(note);
    await page.getByRole("button", { name: message("dashboard.myExams.change.send") }).click();
    await expect(page.getByText(message("dashboard.myExams.toast.requested")).first()).toBeVisible();
    await expect(
      row.getByRole("button", { name: message("dashboard.myExams.status.changeRequested") }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("proctor_assignments")
          .select("confirmed_at, change_request")
          .eq("exam_id", EXAMS.math2.id)
          .eq("staff_id", nurlanId)
          .single();
        return data;
      })
      .toEqual({ confirmed_at: null, change_request: note });

    // The exam office: 0.1's exam row says Change requested, and the lobby shows who asked and why.
    const office = await officeContext.newPage();
    await signIn(office, STAFF.dana);
    await expect(examRow(office, EXAMS.math2.title)).toContainText(
      message("dashboard.myExams.status.changeRequested"),
    );
    await office.goto(`/exams/${EXAMS.math2.id}/lobby`);
    await expect(
      office.getByText(
        fill("dashboard.lobby.changeRequest.title", { name: "Nurlan Bekov", from: 65, to: 128 }),
      ),
    ).toBeVisible();
    await expect(office.getByText(note)).toBeVisible();

    // Back on 0.9: Nurlan confirms after all; the request clears and the row is Confirmed.
    await page.reload();
    await row.getByRole("button", { name: message("dashboard.myExams.status.changeRequested") }).click();
    await page
      .getByRole("dialog", { name: confirmTitle })
      .getByRole("button", { name: message("dashboard.myExams.confirm.confirm") })
      .click();
    await expect(
      page.getByText(fill("dashboard.myExams.toast.confirmed", { course: "Mathematics 2" })).first(),
    ).toBeVisible();
    await expect(row).toContainText(message("dashboard.myExams.status.confirmed"));
    await expect(
      page.getByText(fill("dashboard.myExams.banner.title", { course: "Mathematics 2" })),
    ).toHaveCount(0);
    const confirmed = await admin
      .from("proctor_assignments")
      .select("confirmed_at, change_request")
      .eq("exam_id", EXAMS.math2.id)
      .eq("staff_id", nurlanId)
      .single();
    expect(confirmed.data?.confirmed_at).not.toBeNull();
    expect(confirmed.data?.change_request).toBeNull();
    const audit = await admin
      .from("audit_log")
      .select("action")
      .eq("actor_id", nurlanId)
      .eq("object_id", EXAMS.math2.id)
      .gte("at", startedAt)
      .order("at");
    expect((audit.data ?? []).map((entry) => entry.action)).toEqual([
      "seats.change_request",
      "seats.confirm",
    ]);
  } finally {
    await officeContext.close();
    const restored = await admin
      .from("proctor_assignments")
      .update(original.assignment)
      .eq("exam_id", EXAMS.math2.id)
      .eq("staff_id", nurlanId);
    const audit = await admin
      .from("audit_log")
      .delete()
      .eq("actor_id", nurlanId)
      .eq("object_id", EXAMS.math2.id)
      .in("action", ["seats.change_request", "seats.confirm"])
      .gte("at", startedAt);
    const exam = rescheduled
      ? await admin.from("exams").update(original.exam).eq("id", EXAMS.math2.id)
      : { error: null };
    const failed = [restored.error, audit.error, exam.error].filter((error) => error !== null);
    if (failed.length > 0) restoreFailed = `e2e: restoring Mathematics 2 failed: ${JSON.stringify(failed)}`;
  }
  if (restoreFailed !== null) throw new Error(restoreFailed);
});

/** The card a lobby row opens (1.5a). */
function studentCard(page: Page, studentId: string) {
  return page.locator(`[data-student-card="${studentId}"]`);
}

test("1.5a on a lobby row and 1.5b's Send hint, which creates the message command the app receives", async ({
  page,
}) => {
  const admin = adminClient();
  const aigerimId = await staffId(STAFF.aigerim);
  let fixture: LobbyFixture | null = null;
  try {
    fixture = await createLobbyFixture({
      proctorId: aigerimId,
      students: [
        // Madina: three card tries failed; the app asked for help on 1.3a.
        [
          { status: { step: "checking" } },
          { status: { step: "identity", detail: "card:retry:1" } },
          {
            status: { step: "identity", detail: "card:help:3" },
            events: [draft("student.help_requested", { topic: "identity" })],
          },
        ],
        // Dias: still on the system check, with no problem.
        [{ status: { step: "checking" } }],
      ],
    });
    const [stuck, other] = fixture.students;
    if (stuck === undefined || other === undefined) throw new Error("e2e: the fixture has no students");

    await signIn(page, STAFF.aigerim);
    await page.goto(`/exams/${fixture.examId}/lobby`);
    // The lobby opens on Need help; All lists Dias, who is still on the system check.
    await page.getByRole("radio", { name: message("dashboard.lobby.table.filter.all"), exact: true }).click();
    const row = page.locator(`tr[data-student-id="${stuck.studentId}"]`);
    await expect(row).toContainText(fill("dashboard.lobby.detail.cardHelp", { tries: 3, max: 3 }));

    // 1.5a: rest the pointer on the row.
    await row.hover();
    const card = studentCard(page, stuck.studentId);
    await expect(card).toBeVisible();
    await expect(card).toContainText(fill("dashboard.lobby.card.step", { step: 2, total: 4 }));
    await expect(card).toContainText(fill("dashboard.lobby.card.tries", { tries: 3, max: 3 }));
    await expect(card).toContainText(message("dashboard.lobby.card.cardUnreadable"));
    await expect(card.locator("[data-step-state]")).toHaveCount(4);
    // Moving to another row closes it and, after a moment, opens that row's card.
    await page.locator(`tr[data-student-id="${other.studentId}"]`).hover();
    await expect(card).toHaveCount(0);
    await expect(studentCard(page, other.studentId)).toContainText(
      fill("dashboard.lobby.card.step", { step: 1, total: 4 }),
    );
    await expect(
      studentCard(page, other.studentId).getByRole("button", {
        name: message("dashboard.lobby.identityHelp.open"),
      }),
    ).toHaveCount(0);

    // 1.5b from Madina's card.
    await row.hover();
    await card.getByRole("button", { name: message("dashboard.lobby.identityHelp.open") }).click();
    const drawer = page.getByRole("dialog", { name: message("dashboard.lobby.identityHelp.title") });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(message("dashboard.wall.event.student_help_requested.title"));
    const hint = `Tilt the card away from the window light (${fixture.runId}).`;
    await drawer.getByRole("textbox").fill(hint);
    await drawer.getByRole("button", { name: message("dashboard.lobby.identityHelp.send") }).click();
    await expect(drawer).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("session_commands")
            .select("id, type, payload, issued_by")
            .eq("session_id", stuck.sessionId);
          return data ?? [];
        },
        { timeout: 15_000 },
      )
      .toEqual([
        expect.objectContaining({
          type: "message",
          payload: { text: hint, scope: "student" },
          issued_by: aigerimId,
        }),
      ]);
    // The app gets it with its next ingest call (and by Realtime), and shows it as 2.1e over 1.3a.
    const { response } = await ingest(stuck, [], { step: "identity", detail: "card:help:3" });
    expect(response.pending_commands?.map((pending) => pending.payload)).toContainEqual({
      text: hint,
      scope: "student",
    });
    // Opening 1.5b read the student's events: one audit row.
    const audit = await admin
      .from("audit_log")
      .select("action")
      .eq("object_id", stuck.sessionId)
      .eq("action", "identity_help.read");
    expect(audit.data?.length).toBe(1);
  } finally {
    await fixture?.destroy();
  }
});

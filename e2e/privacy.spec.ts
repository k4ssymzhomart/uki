// WP 1.12 Privacy (docs/phase-1-plan.md, Work plan: "Delete removes stills, frames, events, identity score
// and device record and keeps the answers and the receipt; Copy gives a 7-day link; both show on A.6").
// Dana, the exam office, works through A.5, A.5a, A.5b and A.6 in the browser:
//
//  1. A.5 lists two open requests (the frames' Yerlan, delete, and Zhansaya, copy, entered here for the
//     seeded students and never acted on); each opens its drawer, and each open writes its audit rows.
//  2. A throwaway student with one flagged still asks for a copy, then for deletion, from A.3: the copy's
//     link downloads the JSON with the still, the delete removes the still from Storage and the frames and
//     events rows and keeps the session with its receipt, and A.6 lists both, the delete under Deletions.
//
// Everything the tests add is removed afterwards. UKI_E2E_FRAMES_DIR=<dir> also saves A.5, A.5a, A.5b and
// A.6 at the frames' 1440 x 960, in English and Russian, for the Figma comparison.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { uuidv7 } from "../packages/contracts/src/index.ts";
import { LOCALE_COOKIE, signIn } from "./support/dashboard.ts";
import { message } from "./support/messages.ts";
import { KRU, STAFF } from "./support/seed.ts";
import { joinExam } from "./support/student.ts";
import { adminClient, cleanUp, userIdsByEmail } from "./support/supabase.ts";
import { baseURL } from "./support/web-server.ts";

const FRAMES_DIR = process.env.UKI_E2E_FRAMES_DIR;
const GROUP_204 = "a2000000-0000-4000-8000-000000000204";
const DAY_MS = 86_400_000;
/** The seeded students the frames name (supabase/seed.sql). */
const YERLAN = { number: "20230877", name: "Yerlan Tokhtarov" };
const ZHANSAYA = { number: "20231302", name: "Zhansaya Omarova" };
/** A 64 x 36 JPEG, as report.spec.ts and the integration tests upload. */
const STILL = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRX1J88FFFFABRRRQAUUUUAXv7Qtf8AoDWX/fc//wAco/tC1/6A1l/33P8A/HKo0VHIv6bK5mXv7Qtf+gNZf99z/wDxyj+0LX/oDWX/AH3P/wDHKo0Uci/psOZl7+0LX/oDWX/fc/8A8co/tC1/6A1l/wB9z/8AxyqNFHIv6bDmZe/tC1/6A1l/33P/APHKP7Qtf+gNZf8Afc//AMcqjRRyL+mw5mFFFFWSFFFFABRRRQAUUUUAf//Z",
  "base64",
);

/** Saves the page at the frame's size when UKI_E2E_FRAMES_DIR is set. */
async function captureFrame(page: Page, name: string): Promise<void> {
  if (!FRAMES_DIR) return;
  mkdirSync(FRAMES_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  // The development build's Next.js indicator sits over the sidebar's user block.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.mouse.move(0, 959);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${FRAMES_DIR}/${name}.png` });
}

async function studentId(number: string): Promise<string> {
  const { data, error } = await adminClient()
    .from("students")
    .select("id")
    .eq("workspace_id", KRU.workspaceId)
    .eq("student_number", number)
    .single();
  if (error) throw new Error(`e2e: student ${number}: ${error.message}`);
  return data.id;
}

/** Dana's audit rows of `actions` written since `sinceIso`. */
async function auditRows(actorId: string, actions: readonly string[], sinceIso: string) {
  const { data, error } = await adminClient()
    .from("audit_log")
    .select("action, object_type, object_id, meta")
    .eq("actor_id", actorId)
    .in("action", actions)
    .gte("at", sinceIso);
  if (error) throw new Error(`e2e: reading audit_log failed: ${error.message}`);
  return data;
}

const PAGE_READS = ["privacy_centre.read", "data_request.read", "audit.read", "student.read"] as const;

async function removeAudit(actorId: string, sinceIso: string, objectIds: readonly string[] = []) {
  const admin = adminClient();
  const steps: Parameters<typeof cleanUp>[1][number][] = [
    [
      "Dana's reads",
      () =>
        admin.from("audit_log").delete().eq("actor_id", actorId).in("action", PAGE_READS).gte("at", sinceIso),
    ],
  ];
  if (objectIds.length > 0) {
    steps.push([
      "rows about the fixtures",
      () => admin.from("audit_log").delete().in("object_id", objectIds).gte("at", sinceIso),
    ]);
  }
  await cleanUp("audit rows", steps);
}

/** The drawer over A.5 (A.5a or A.5b). */
function drawer(page: Page) {
  return page.getByRole("dialog");
}

let danaId = "";
test.beforeAll(async () => {
  const ids = await userIdsByEmail([STAFF.dana]);
  danaId = ids.get(STAFF.dana) ?? "";
  expect(danaId).not.toBe("");
});

test("A.5 lists the open requests, and each opens A.5a or A.5b", async ({ page }) => {
  const admin = adminClient();
  const since = new Date(Date.now() - 2000).toISOString();
  const [yerlanId, zhansayaId] = await Promise.all([studentId(YERLAN.number), studentId(ZHANSAYA.number)]);
  const now = Date.now();
  const requests: string[] = [];
  try {
    // As the exam office enters them: Yerlan asked 5 days ago, Zhansaya 3 days ago; both due in 7 days.
    const { data, error } = await admin
      .from("data_requests")
      .insert([
        {
          workspace_id: KRU.workspaceId,
          student_id: yerlanId,
          kind: "delete",
          received_at: new Date(now - 5 * DAY_MS).toISOString(),
          due_at: new Date(now + 2 * DAY_MS).toISOString(),
        },
        {
          workspace_id: KRU.workspaceId,
          student_id: zhansayaId,
          kind: "copy",
          received_at: new Date(now - 3 * DAY_MS).toISOString(),
          due_at: new Date(now + 4 * DAY_MS).toISOString(),
        },
      ])
      .select("id, kind");
    if (error) throw new Error(`e2e: fixture data_requests: ${error.message}`);
    requests.push(...data.map((row) => row.id));
    const yerlanRequest = data.find((row) => row.kind === "delete")?.id ?? "";
    const zhansayaRequest = data.find((row) => row.kind === "copy")?.id ?? "";

    await signIn(page, STAFF.dana);
    const privacy = page
      .getByRole("navigation")
      .getByRole("link", { name: message("dashboard.shell.nav.privacy") });
    await expect(privacy).toHaveAttribute("href", "/privacy-centre");
    await privacy.click();
    await expect(page).toHaveURL(/\/privacy-centre$/, { timeout: 90_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.privacy.title") }),
    ).toBeVisible();
    await expect(page.locator(`[data-map-row="frames"]`)).toContainText(
      message("dashboard.privacy.map.server"),
    );
    const yerlanRow = page.locator(`li[data-request-id="${yerlanRequest}"]`);
    const zhansayaRow = page.locator(`li[data-request-id="${zhansayaRequest}"]`);
    await expect(yerlanRow).toContainText(message("dashboard.privacy.requests.kind.delete"));
    await expect(yerlanRow).toContainText(YERLAN.name);
    await expect(zhansayaRow).toContainText(message("dashboard.privacy.requests.kind.copy"));
    await captureFrame(page, "A.5");

    // A.5a: what the delete removes and keeps; nothing is deleted here.
    await yerlanRow.getByRole("link", { name: message("dashboard.privacy.requests.review") }).click();
    await expect(page).toHaveURL(new RegExp(`\\?request=${yerlanRequest}$`));
    await expect(drawer(page)).toContainText(message("dashboard.privacy.drawer.title.delete"));
    await expect(drawer(page)).toContainText(`${YERLAN.name} · ${YERLAN.number}`);
    await expect(drawer(page).locator("li[data-item]")).toHaveCount(4);
    await expect(drawer(page).getByRole("button", { name: /^Delete 3 items$/ })).toBeVisible();
    await captureFrame(page, "A.5a");
    await drawer(page)
      .getByRole("button", { name: message("dashboard.privacy.drawer.close") })
      .click();
    await expect(page).toHaveURL(/\/privacy-centre$/);

    // A.5b: what the copy includes.
    await zhansayaRow.getByRole("link", { name: message("dashboard.privacy.requests.review") }).click();
    await expect(drawer(page)).toContainText(message("dashboard.privacy.drawer.title.copy"));
    await expect(drawer(page)).toContainText(`${ZHANSAYA.name} · ${ZHANSAYA.number}`);
    await expect(
      drawer(page).getByRole("button", { name: message("dashboard.privacy.copy.button") }),
    ).toBeVisible();
    await captureFrame(page, "A.5b");

    // The same in Russian.
    if (FRAMES_DIR) {
      await page.context().addCookies([{ name: LOCALE_COOKIE, value: "ru", url: baseURL }]);
      await page.reload();
      await expect(drawer(page)).toContainText(message("dashboard.privacy.drawer.title.copy", "ru"));
      await captureFrame(page, "A.5b-ru");
      await page.goto(`/privacy-centre?request=${yerlanRequest}`);
      await expect(drawer(page)).toContainText(message("dashboard.privacy.drawer.title.delete", "ru"));
      await captureFrame(page, "A.5a-ru");
      await page.goto("/privacy-centre");
      await expect(
        page.getByRole("heading", { level: 1, name: message("dashboard.privacy.title", "ru") }),
      ).toBeVisible();
      await captureFrame(page, "A.5-ru");
    }

    // Each page view and each drawer wrote its row before the data was read.
    const reads = await auditRows(danaId, ["privacy_centre.read", "data_request.read"], since);
    expect(reads.filter((row) => row.action === "privacy_centre.read").length).toBeGreaterThanOrEqual(3);
    expect(reads.filter((row) => row.action === "data_request.read").map((row) => row.object_id)).toEqual(
      expect.arrayContaining([yerlanId, zhansayaId]),
    );
    // Nothing was acted on.
    const { data: after } = await admin.from("data_requests").select("status").in("id", requests);
    expect(after?.map((row) => row.status)).toEqual(["received", "received"]);
  } finally {
    await cleanUp("fixture requests", [
      ["data_requests", () => admin.from("data_requests").delete().in("id", requests)],
    ]);
    await removeAudit(danaId, since, [yerlanId, zhansayaId]);
  }
});

test("a copy from A.5b gives a working link, a delete from A.5a removes the stills, and A.6 shows both", async ({
  page,
}) => {
  const admin = adminClient();
  const since = new Date(Date.now() - 2000).toISOString();
  const runId = randomBytes(3).toString("hex").toUpperCase();
  const number = `E2E${runId}`;
  // A.6 writes students short ("Test1A2B3C S."), so the first name carries the run.
  const name = `Test${runId} Student`;
  const code = `E2E-PRIV-${runId}`;
  const created = {
    studentId: null as string | null,
    examId: null as string | null,
    uid: null as string | null,
    stillPath: null as string | null,
  };
  try {
    // A throwaway student on a throwaway exam whose lobby is open; she joins from the app, and one phone
    // flag with one still arrives, as ingest and the frames function store them.
    const { data: student, error: studentError } = await admin
      .from("students")
      .insert({ workspace_id: KRU.workspaceId, group_id: GROUP_204, student_number: number, full_name: name })
      .select("id")
      .single();
    if (studentError) throw new Error(`e2e: fixture student: ${studentError.message}`);
    created.studentId = student.id;
    const now = Date.now();
    const { data: exam, error: examError } = await admin
      .from("exams")
      .insert({
        workspace_id: KRU.workspaceId,
        faculty_id: KRU.mathFacultyId,
        title: `E2E privacy ${runId}`,
        course: "E2E",
        kind: "Test",
        code,
        mode: "app",
        status: "scheduled",
        starts_at: new Date(now + 10 * 60_000).toISOString(),
        duration_min: 30,
        lobby_opens_at: new Date(now - 10 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (examError) throw new Error(`e2e: fixture exam: ${examError.message}`);
    created.examId = exam.id;
    const roster = await admin
      .from("exam_students")
      .insert({ exam_id: exam.id, student_id: student.id, seat: 1 });
    if (roster.error) throw new Error(`e2e: fixture exam_students: ${roster.error.message}`);
    const joined = await joinExam(code, number);
    created.uid = joined.uid;
    const eventId = uuidv7();
    const at = new Date(now - 60_000).toISOString();
    const flag = await admin.from("events").insert({
      id: eventId,
      session_id: joined.sessionId,
      exam_id: exam.id,
      type: "phone.detected",
      source: "app",
      review: "flag",
      seq: 1,
      at,
      data: { score: 0.91, held_ms: 800 },
      frame_count: 1,
    });
    if (flag.error) throw new Error(`e2e: fixture event: ${flag.error.message}`);
    const stillPath = `${exam.id}/${joined.sessionId}/${eventId}-0.jpg`;
    created.stillPath = stillPath;
    const upload = await admin.storage
      .from("frames")
      .upload(stillPath, STILL, { contentType: "image/jpeg", upsert: true });
    if (upload.error) throw new Error(`e2e: still upload: ${upload.error.message}`);
    const still = await admin.from("frames").insert({
      id: randomUUID(),
      event_id: eventId,
      session_id: joined.sessionId,
      exam_id: exam.id,
      storage_path: stillPath,
      captured_at: at,
    });
    if (still.error) throw new Error(`e2e: fixture frame: ${still.error.message}`);
    const scored = await admin.from("sessions").update({ identity_score: 0.93 }).eq("id", joined.sessionId);
    if (scored.error) throw new Error(`e2e: fixture identity score: ${scored.error.message}`);

    await signIn(page, STAFF.dana);

    // A.3's Export data opens A.5b for her; Create secure link writes the file and shows the link once.
    await page.goto(`/students/${student.id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("link", { name: message("dashboard.privacy.profile.export") }).click();
    await expect(page).toHaveURL(new RegExp(`/privacy-centre\\?new=copy&student=${student.id}$`), {
      timeout: 90_000,
    });
    await expect(drawer(page)).toContainText(message("dashboard.privacy.drawer.title.copy"));
    await drawer(page)
      .getByRole("button", { name: message("dashboard.privacy.copy.button") })
      .click();
    await expect(drawer(page)).toContainText(message("dashboard.privacy.copy.ready.title"), {
      timeout: 60_000,
    });
    const link = await drawer(page).getByRole("textbox").inputValue();
    const download = await page.request.get(link);
    expect(download.status()).toBe(200);
    const copy = (await download.json()) as {
      format: string;
      student: { student_number: string };
      flags: { frames: { image_jpeg_base64: string | null }[] }[];
    };
    expect(copy.format).toBe("uki.data-copy.v1");
    expect(copy.student.student_number).toBe(number);
    expect(copy.flags[0]?.frames[0]?.image_jpeg_base64).toBe(STILL.toString("base64"));

    // A.3's Delete on request opens A.5a; Delete removes what the list says.
    await page.goto(`/students/${student.id}`);
    await page.getByRole("link", { name: message("dashboard.students.profile.kept.delete") }).click();
    await expect(page).toHaveURL(new RegExp(`/privacy-centre\\?new=delete&student=${student.id}$`), {
      timeout: 90_000,
    });
    await expect(drawer(page)).toContainText(message("dashboard.privacy.drawer.title.delete"));
    await expect(drawer(page).locator('li[data-item="frames"]')).toContainText("1 frame from 1 exam");
    await drawer(page)
      .getByRole("button", { name: /^Delete 3 items$/ })
      .click();
    await expect(drawer(page)).toContainText(message("dashboard.privacy.delete.done.title"), {
      timeout: 60_000,
    });
    await expect(page).toHaveURL(/\/privacy-centre\?request=[0-9a-f-]{36}$/);
    await expect(drawer(page).locator('li[data-item="frames"]')).toContainText("0 frames from 0 exams");

    // The still is gone from Storage, the frames and events rows with it; the session and its receipt stay.
    const gone = await admin.storage.from("frames").download(stillPath);
    expect(gone.error).not.toBeNull();
    const frames = await admin
      .from("frames")
      .select("id", { count: "exact", head: true })
      .eq("session_id", joined.sessionId);
    const events = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("session_id", joined.sessionId);
    expect(frames.count).toBe(0);
    expect(events.count).toBe(0);
    const { data: session } = await admin
      .from("sessions")
      .select("id, identity_score, device")
      .eq("id", joined.sessionId)
      .single();
    expect(session?.identity_score).toBeNull();
    expect(session?.device).toEqual({});

    // A.6 lists the delete and the copy, newest first; the delete is under Deletions too.
    await drawer(page)
      .getByRole("button", { name: message("dashboard.privacy.drawer.close") })
      .click();
    await page.getByRole("link", { name: message("dashboard.privacy.recent.open") }).click();
    await expect(page).toHaveURL(/\/privacy-centre\/audit-log$/, { timeout: 90_000 });
    const short = `Test${runId} S.`;
    const deleted = page.locator('tr[data-action="data_request.delete"]').filter({ hasText: short });
    const copied = page.locator('tr[data-action="data_request.copy"]').filter({ hasText: short });
    await expect(deleted).toHaveCount(1);
    await expect(deleted).toContainText(message("dashboard.privacy.audit.action.data_request_delete"));
    await expect(deleted).toContainText("Dana Akhmetova");
    await expect(copied).toHaveCount(1);
    const order = await page
      .locator("tbody tr[data-action]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-action")));
    expect(order.indexOf("data_request.delete")).toBeLessThan(order.indexOf("data_request.copy"));
    if (FRAMES_DIR) {
      // A reload drops the delete's toast, which would sit over the table.
      await page.reload();
      await expect(deleted).toHaveCount(1);
      await captureFrame(page, "A.6");
    }

    await page.getByRole("radio", { name: message("dashboard.privacy.audit.tab.deletions") }).click();
    await expect(page).toHaveURL(/\?tab=deletions$/, { timeout: 90_000 });
    await expect(deleted).toHaveCount(1);
    await expect(page.locator('tr[data-action="data_request.copy"]')).toHaveCount(0);
    await page.getByRole("searchbox", { name: message("dashboard.privacy.audit.search.label") }).fill(runId);
    await expect(page.locator("tbody tr[data-action]")).toHaveCount(1);

    if (FRAMES_DIR) {
      await page.goto("/privacy-centre/audit-log");
      await page.context().addCookies([{ name: LOCALE_COOKIE, value: "ru", url: baseURL }]);
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: message("dashboard.privacy.audit.title", "ru") }),
      ).toBeVisible();
      await captureFrame(page, "A.6-ru");
    }
  } finally {
    const steps: Parameters<typeof cleanUp>[1][number][] = [];
    const studentRow = created.studentId;
    const examId = created.examId;
    if (studentRow !== null) {
      const { data: rows } = await admin
        .from("data_requests")
        .select("id, export_path")
        .eq("student_id", studentRow);
      const exports = (rows ?? []).flatMap((row) => (row.export_path ? [row.export_path] : []));
      if (exports.length > 0) await admin.storage.from("exports").remove(exports);
      steps.push(["data_requests", () => admin.from("data_requests").delete().eq("student_id", studentRow)]);
    }
    if (created.stillPath !== null) await admin.storage.from("frames").remove([created.stillPath]);
    if (examId !== null) {
      steps.push(
        ["frames", () => admin.from("frames").delete().eq("exam_id", examId)],
        ["events", () => admin.from("events").delete().eq("exam_id", examId)],
        ["sessions", () => admin.from("sessions").delete().eq("exam_id", examId)],
        ["exam_students", () => admin.from("exam_students").delete().eq("exam_id", examId)],
        ["exams", () => admin.from("exams").delete().eq("id", examId)],
        ["audit_log of the exam", () => admin.from("audit_log").delete().eq("object_id", examId)],
      );
    }
    if (studentRow !== null) {
      steps.push(["students", () => admin.from("students").delete().eq("id", studentRow)]);
    }
    const uid = created.uid;
    if (uid !== null) {
      steps.push(
        ["audit_log of the student", () => admin.from("audit_log").delete().eq("actor_id", uid)],
        ["auth user", () => admin.auth.admin.deleteUser(uid)],
      );
    }
    await cleanUp(`fixture ${code}`, steps);
    await removeAudit(danaId, since, studentRow === null ? [] : [studentRow]);
  }
});

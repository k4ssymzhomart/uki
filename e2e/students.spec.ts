// WP 1.11 Students and settings (docs/phase-1-plan.md, Work plan: "Search finds Madina by name and by
// 20231187; A.3 shows when and in which language she accepted the rules; a changed default reaches the
// next new exam"). Dana, the exam office, works through A.2, A.3 and A.4 in the browser. The rules are
// accepted the way the app does it: Madina joins a throwaway exam with join_exam and sends the ready
// status with the rules' language through `ingest`, which stamps `rules_accepted_at` and `rules_locale`.
// Each test checks its audit rows and removes every row it made.
//
// UKI_E2E_FRAMES_DIR=<dir> also saves A.2, A.3 and A.4 at the frames' 1440 x 960 for the Figma comparison.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { LOCALE_COOKIE, signIn } from "./support/dashboard.ts";
import { message } from "./support/messages.ts";
import { KRU, STAFF } from "./support/seed.ts";
import { E2E_APP_VERSION, joinExam } from "./support/student.ts";
import { adminClient, cleanUp, staffClient, userIdsByEmail } from "./support/supabase.ts";
import { baseURL } from "./support/web-server.ts";

const MADINA = { id: "b0000000-0000-4000-8000-000020231187", number: "20231187", name: "Madina Tulegenova" };
const GROUP_204 = "a2000000-0000-4000-8000-000000000204";
const FRAMES_DIR = process.env.UKI_E2E_FRAMES_DIR;

/** Saves the page at the frame's size when UKI_E2E_FRAMES_DIR is set. */
async function captureFrame(page: Page, name: string): Promise<void> {
  if (!FRAMES_DIR) return;
  mkdirSync(FRAMES_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  // The development build's Next.js indicator sits over the sidebar's user block.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.mouse.move(0, 959);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${FRAMES_DIR}/${name}.png` });
}

/**
 * Opens a page from its sidebar item. `next dev` compiles a route on its first visit, which on a loaded
 * shared stack can take longer than an assertion's 15 s.
 */
async function openFromSidebar(page: Page, item: "students" | "settings"): Promise<void> {
  const link = page
    .getByRole("navigation")
    .getByRole("link", { name: message(`dashboard.shell.nav.${item}`) });
  await expect(link).toHaveAttribute("href", `/${item}`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${item}$`), { timeout: 90_000 });
}

/** Dana's audit rows of `action` written since `sinceIso`. */
async function auditRows(actorId: string, action: string, sinceIso: string) {
  const { data, error } = await adminClient()
    .from("audit_log")
    .select("action, object_type, object_id, at")
    .eq("actor_id", actorId)
    .eq("action", action)
    .gte("at", sinceIso);
  if (error) throw new Error(`e2e: reading audit_log failed: ${error.message}`);
  return data;
}

async function removeAudit(actorId: string, actions: readonly string[], sinceIso: string): Promise<void> {
  await cleanUp("audit rows", [
    [
      "audit_log",
      () =>
        adminClient()
          .from("audit_log")
          .delete()
          .eq("actor_id", actorId)
          .in("action", actions)
          .gte("at", sinceIso),
    ],
  ]);
}

let danaId = "";
test.beforeAll(async () => {
  const ids = await userIdsByEmail([STAFF.dana]);
  danaId = ids.get(STAFF.dana) ?? "";
  expect(danaId).not.toBe("");
});

test("A.2 finds Madina by name and by 20231187, and A.2 and A.3 write their audit rows", async ({ page }) => {
  const since = new Date(Date.now() - 2000).toISOString();
  try {
    await signIn(page, STAFF.dana);
    await openFromSidebar(page, "students");
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.students.title") }),
    ).toBeVisible();
    await captureFrame(page, "A.2");

    const search = page.getByRole("searchbox", { name: message("dashboard.students.search.label") });
    const rows = page.locator("tbody tr[data-student-id]");
    const madina = page.locator(`tr[data-student-id="${MADINA.id}"]`);

    await search.fill("Madina");
    await expect(madina).toBeVisible();
    await expect(madina).toContainText(MADINA.number);
    await expect(rows.filter({ hasNotText: "Madina" })).toHaveCount(0);

    await search.fill("tulegenova madina");
    await expect(rows).toHaveCount(1);
    await expect(madina).toContainText(MADINA.name);

    await search.fill(MADINA.number);
    await expect(rows).toHaveCount(1);
    await expect(madina).toContainText(MADINA.name);
    await expect(page).toHaveURL(new RegExp(`/students\\?q=${MADINA.number}$`));
    await captureFrame(page, "A.2-search");

    // The address keeps the search: a reload renders the same single row on the server.
    await page.reload();
    await expect(rows).toHaveCount(1);
    await expect(search).toHaveValue(MADINA.number);

    expect((await auditRows(danaId, "students.list", since)).length).toBeGreaterThanOrEqual(2);

    await madina.getByRole("link", { name: MADINA.name }).click();
    await expect(page).toHaveURL(new RegExp(`/students/${MADINA.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: MADINA.name })).toBeVisible();
    await expect(
      page.getByText(message("dashboard.students.profile.consent.title"), { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await auditRows(danaId, "student.read", since)).map((row) => row.object_id))
      .toContain(MADINA.id);

    // Back returns to the filtered list.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`\\?q=${MADINA.number}$`));
    await expect(rows).toHaveCount(1);
  } finally {
    await removeAudit(danaId, ["students.list", "student.read"], since);
  }
});

test("A.3 shows when and in which language Madina accepted the rules", async ({ page }) => {
  const admin = adminClient();
  const since = new Date(Date.now() - 2000).toISOString();
  const runId = randomBytes(3).toString("hex").toUpperCase();
  const code = `E2E-RULES-${runId}`;
  const title = `E2E rules ${runId}`;
  const created = { examId: null as string | null, uid: null as string | null };
  try {
    // A throwaway exam with Madina on its roster, its lobby open now.
    const now = Date.now();
    const { data: exam, error } = await admin
      .from("exams")
      .insert({
        workspace_id: KRU.workspaceId,
        faculty_id: KRU.mathFacultyId,
        title,
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
    if (error) throw new Error(`e2e: fixture exam: ${error.message}`);
    created.examId = exam.id;
    const group = await admin.from("exam_groups").insert({ exam_id: exam.id, group_id: GROUP_204 });
    if (group.error) throw new Error(`e2e: fixture exam_groups: ${group.error.message}`);
    const roster = await admin
      .from("exam_students")
      .insert({ exam_id: exam.id, student_id: MADINA.id, seat: 1 });
    if (roster.error) throw new Error(`e2e: fixture exam_students: ${roster.error.message}`);

    // The app: join with the code and her number, then agree to the rules in Russian (1.4 Continue
    // sends the ready status with the rules' language). The status goes to `ingest_batch`, the database
    // function behind the ingest Edge Function, with Madina's session owner, because the local stack's
    // edge runtime may serve contracts older than Phase 1, which drop `rules_locale`.
    const student = await joinExam(code, MADINA.number);
    created.uid = student.uid;
    const batch = await admin.rpc("ingest_batch", {
      p_session_id: student.sessionId,
      p_events: [],
      p_status: { step: "ready", rules_locale: "ru" },
      p_owner: student.uid,
    });
    if (batch.error) throw new Error(`e2e: ingest_batch failed: ${batch.error.message}`);
    const { data: stamped } = await admin
      .from("sessions")
      .select("rules_accepted_at, rules_locale")
      .eq("id", student.sessionId)
      .single();
    expect(stamped?.rules_locale).toBe("ru");
    expect(stamped?.rules_accepted_at).toBeTruthy();
    const acceptedAt = stamped?.rules_accepted_at as string;
    // As A.3 writes it: the day and short month and the 24-hour time in Asia/Almaty ("9 Oct, 09:58").
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", day: "numeric", month: "short" })
      .format(new Date(acceptedAt))
      .replace(/\bSept\b/, "Sep");
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Almaty",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(acceptedAt));

    await signIn(page, STAFF.dana);
    await page.goto(`/students/${MADINA.id}`);
    await expect(page.getByRole("heading", { level: 1, name: MADINA.name })).toBeVisible();
    const consentCard = (locale: "en" | "ru") =>
      page.locator("section").filter({
        has: page.getByRole("heading", { name: message("dashboard.students.profile.consent.title", locale) }),
      });
    const consent = consentCard("en");
    await expect(consent).toContainText(`Exam rules · ${message("dashboard.students.language.ru")}`);
    await expect(consent).toContainText(`Accepted ${date}, ${time}`);
    // The exam and the laptop the session reported.
    await expect(page.locator("li[data-session-id]").filter({ hasText: title })).toBeVisible();
    await expect(page.getByText(`Üki ${E2E_APP_VERSION} · seen`, { exact: false })).toBeVisible();
    await captureFrame(page, "A.3");

    // In Russian the same record reads «Правила экзамена · Русский».
    await page.context().addCookies([{ name: LOCALE_COOKIE, value: "ru", url: baseURL }]);
    await page.reload();
    await expect(consentCard("ru")).toContainText(
      `${message("dashboard.students.profile.consent.rules", "ru")} · ${message("dashboard.students.language.ru", "ru")}`,
    );
    await captureFrame(page, "A.3-ru");

    expect((await auditRows(danaId, "student.read", since)).map((row) => row.object_id)).toContain(MADINA.id);
  } finally {
    const examId = created.examId;
    const steps: Parameters<typeof cleanUp>[1][number][] = [];
    if (examId !== null) {
      steps.push(
        ["events", () => admin.from("events").delete().eq("exam_id", examId)],
        ["sessions", () => admin.from("sessions").delete().eq("exam_id", examId)],
        ["exam_students", () => admin.from("exam_students").delete().eq("exam_id", examId)],
        ["exam_groups", () => admin.from("exam_groups").delete().eq("exam_id", examId)],
        ["exams", () => admin.from("exams").delete().eq("id", examId)],
        ["audit_log of the exam", () => admin.from("audit_log").delete().eq("object_id", examId)],
      );
    }
    const uid = created.uid;
    if (uid !== null) {
      steps.push(
        ["audit_log of the student", () => admin.from("audit_log").delete().eq("actor_id", uid)],
        ["auth user", () => admin.auth.admin.deleteUser(uid)],
      );
    }
    await cleanUp(`fixture ${code}`, steps);
    await removeAudit(danaId, ["student.read"], since);
  }
});

test("a default changed on A.4 reaches the next new exam", async ({ page }) => {
  const admin = adminClient();
  const since = new Date(Date.now() - 2000).toISOString();
  const { data: before, error } = await admin
    .from("workspaces")
    .select("settings")
    .eq("id", KRU.workspaceId)
    .single();
  if (error) throw new Error(`e2e: reading the settings failed: ${error.message}`);
  let draftId: string | null = null;
  try {
    await signIn(page, STAFF.dana);
    await openFromSidebar(page, "settings");
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.settings.title") }),
    ).toBeVisible();
    await captureFrame(page, "A.4");

    const saved = page.getByText(message("dashboard.settings.saved"), { exact: true });
    const choose = async (label: string, option: string) => {
      await page.getByRole("combobox", { name: label }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
      await expect(saved).toBeVisible();
    };
    await choose(message("dashboard.settings.defaults.duration.label"), "120 min");
    await choose(message("dashboard.settings.defaults.lobby.label"), "30 min before the start");
    await choose(message("dashboard.settings.defaults.gaze.label"), "3 seconds");
    await page.getByRole("switch", { name: message("dashboard.settings.checks.identity.title") }).click();
    await expect
      .poll(async () => {
        const { data } = await admin.from("workspaces").select("settings").eq("id", KRU.workspaceId).single();
        return data?.settings;
      })
      .toMatchObject({
        default_duration_min: 120,
        lobby_minutes: 30,
        default_checks: { gaze_s: 3, identity: false },
      });

    // The page reads the stored settings again on a reload.
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: message("dashboard.settings.defaults.duration.label") }),
    ).toContainText("120 min");
    await expect(
      page.getByRole("switch", { name: message("dashboard.settings.checks.identity.title") }),
    ).toHaveAttribute("aria-checked", "false");

    // The next new exam: save_exam_draft with no id, as /exams/new calls it (WP 1.3).
    const { client } = await staffClient(STAFF.dana);
    const { data: draft, error: draftError } = await client.rpc("save_exam_draft", { exam: {} });
    if (draftError) throw new Error(`e2e: save_exam_draft failed: ${draftError.message}`);
    const row = draft as {
      id: string;
      duration_min: number;
      checks: Record<string, unknown>;
      starts_at: string;
      lobby_opens_at: string;
    };
    draftId = row.id;
    expect(row.duration_min).toBe(120);
    expect(row.checks).toMatchObject({ gaze_s: 3, identity: false, lock: true });
    expect(Date.parse(row.starts_at) - Date.parse(row.lobby_opens_at)).toBe(30 * 60_000);
    await client.auth.signOut();

    const audit = await auditRows(danaId, "settings.update", since);
    expect(audit.length).toBeGreaterThanOrEqual(4);
    expect(audit.every((entry) => entry.object_id === KRU.workspaceId)).toBe(true);
  } finally {
    await cleanUp("settings", [
      [
        "restore settings",
        () => admin.from("workspaces").update({ settings: before.settings }).eq("id", KRU.workspaceId),
      ],
    ]);
    const id = draftId;
    if (id !== null) {
      await cleanUp("draft", [
        ["exam_groups", () => admin.from("exam_groups").delete().eq("exam_id", id)],
        ["exams", () => admin.from("exams").delete().eq("id", id)],
        ["audit_log of the draft", () => admin.from("audit_log").delete().eq("object_id", id)],
      ]);
    }
    await removeAudit(danaId, ["settings.update"], since);
    await cleanUp("restore audit row", [
      [
        "audit_log",
        () =>
          admin
            .from("audit_log")
            .delete()
            .is("actor_id", null)
            .eq("action", "settings.update")
            .eq("object_id", KRU.workspaceId)
            .gte("at", since),
      ],
    ]);
  }
});

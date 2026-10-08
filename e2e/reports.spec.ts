// WP 1.10 Reports page (docs/phase-1-plan.md, Testing: "A.1 shows the term; Export PDF prints"). Dana,
// the exam office, opens A.1 from the sidebar. The page shows the current term with the numbers of the
// term_* views, which the test reads with the secret key (a caller that skips row-level security reads
// every row, as supabase/tests/18_term_views.test.sql checks); each view writes one `reports.read` audit
// row; the faculty picker narrows the numbers to one faculty; Export PDF calls print(), and printing puts
// the page alone on one A4 sheet. Works on any seed: the expectations come from the views.
//
// UKI_E2E_FRAMES_DIR=<dir> also saves A.1 at the frame's 1440 x 960 for the Figma comparison.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { pageStatus, signIn } from "./support/dashboard.ts";
import { message } from "./support/messages.ts";
import { KRU, STAFF } from "./support/seed.ts";
import { adminClient, cleanUp, userIdsByEmail } from "./support/supabase.ts";

const FRAMES_DIR = process.env.UKI_E2E_FRAMES_DIR;
const NUMBER = new Intl.NumberFormat("en");

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

/** The term key of today in Asia/Almaty, as WP 1.1's term_key(): autumn from September to January. */
function currentTerm(now: Date): string {
  const [year = 0, month = 0] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  if (month >= 9) return `${year}-autumn`;
  if (month === 1) return `${year - 1}-autumn`;
  return `${year}-spring`;
}

/** "Autumn term 2026": the English arm of dashboard.reports.term for the term. */
function termLabel(term: string): string {
  const [year = "", season] = term.split("-");
  const arm = season === "spring" ? "spring" : "other";
  const match = new RegExp(`${arm} \\{([^{}]*\\{year\\}[^{}]*)\\}`).exec(message("dashboard.reports.term"));
  if (!match?.[1]) throw new Error("e2e: dashboard.reports.term has no arm for the term");
  return match[1].replace("{year}", year);
}

type Kpis = { exams_run: number; sessions: number };

/** The term's tiles from term_kpis: all faculties, or one. */
async function termKpis(term: string, facultyId: string | null): Promise<Kpis> {
  const query = adminClient()
    .from("term_kpis")
    .select("exams_run, sessions")
    .eq("workspace_id", KRU.workspaceId)
    .eq("term", term);
  const { data, error } = await (facultyId === null
    ? query.eq("all_faculties", true)
    : query.eq("all_faculties", false).eq("faculty_id", facultyId));
  if (error) throw new Error(`e2e: reading term_kpis failed: ${error.message}`);
  const row = data?.[0];
  return { exams_run: row?.exams_run ?? 0, sessions: row?.sessions ?? 0 };
}

/** The term A.1 opens on: today's term when it has run exams, else the newest that has. */
async function expectedTerm(): Promise<string> {
  const { data, error } = await adminClient()
    .from("term_exams")
    .select("term, term_start")
    .eq("workspace_id", KRU.workspaceId)
    .order("term_start", { ascending: false });
  if (error) throw new Error(`e2e: reading term_exams failed: ${error.message}`);
  const terms = (data ?? []).flatMap((row) => (row.term ? [row.term] : []));
  const current = currentTerm(new Date());
  const term = terms.includes(current) ? current : terms[0];
  if (!term) throw new Error("e2e: the seed has no exam that ran; A.1 needs one");
  return term;
}

async function expectTiles(page: Page, kpis: Kpis): Promise<void> {
  await expect(page.locator('[data-kpi="exams"] p').nth(1)).toHaveText(NUMBER.format(kpis.exams_run));
  await expect(page.locator('[data-kpi="sessions"] p').nth(1)).toHaveText(NUMBER.format(kpis.sessions));
}

async function auditIds(actorId: string, sinceIso: string): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("audit_log")
    .select("object_type, object_id")
    .eq("actor_id", actorId)
    .eq("action", "reports.read")
    .gte("at", sinceIso);
  if (error) throw new Error(`e2e: reading audit_log failed: ${error.message}`);
  return (data ?? []).filter((row) => row.object_type === "workspace").map((row) => row.object_id ?? "");
}

let danaId = "";
test.beforeAll(async () => {
  const ids = await userIdsByEmail([STAFF.dana]);
  danaId = ids.get(STAFF.dana) ?? "";
  expect(danaId).not.toBe("");
});

test("A.1 shows the term from the term views, by faculty, and Export PDF prints it on A4", async ({
  page,
}, testInfo) => {
  const since = new Date(Date.now() - 2000).toISOString();
  try {
    const term = await expectedTerm();
    const all = await termKpis(term, null);

    await signIn(page, STAFF.dana);
    const link = page
      .getByRole("navigation")
      .getByRole("link", { name: message("dashboard.shell.nav.reports") });
    await expect(link).toHaveAttribute("href", "/reports");
    await link.click();
    // `next dev` compiles the route on its first visit.
    await expect(page).toHaveURL(/\/reports$/, { timeout: 90_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.reports.title") }),
    ).toBeVisible({
      timeout: 90_000,
    });

    // The term: in the breadcrumb and on the picker, with the term's numbers.
    const breadcrumb = `${message("dashboard.reports.title")} / ${termLabel(term)}`;
    await expect(page.getByRole("banner").getByText(breadcrumb)).toBeVisible();
    await expect(page.getByRole("button", { name: message("dashboard.reports.filter.term") })).toHaveText(
      termLabel(term),
    );
    await expectTiles(page, all);
    const weekly = page.locator('[data-chart="weekly"]');
    await expect(weekly.getByRole("img")).toBeVisible();
    await expect.poll(() => auditIds(danaId, since)).toContain(term);
    await captureFrame(page, "A.1");

    // The faculty picker: the faculty with the most sessions this term, then all faculties again.
    const { data: faculties } = await adminClient()
      .from("term_kpis")
      .select("faculty_id, sessions")
      .eq("workspace_id", KRU.workspaceId)
      .eq("term", term)
      .eq("all_faculties", false)
      .order("sessions", { ascending: false })
      .limit(1);
    const facultyId = faculties?.[0]?.faculty_id;
    if (facultyId) {
      const { data: faculty } = await adminClient()
        .from("faculties")
        .select("name")
        .eq("id", facultyId)
        .single();
      const picker = page.getByRole("button", { name: message("dashboard.reports.filter.faculty") });
      await picker.click();
      await page.getByRole("menuitem", { name: faculty?.name ?? "" }).click();
      await expect(picker).toHaveText(faculty?.name ?? "");
      await expectTiles(page, await termKpis(term, facultyId));
      await expect.poll(() => auditIds(danaId, since)).toContain(`${term}:${facultyId}`);

      await picker.click();
      await page.getByRole("menuitem", { name: message("dashboard.shell.workspace.allFaculties") }).click();
      await expect(picker).toHaveText(message("dashboard.shell.workspace.allFaculties"));
      await expectTiles(page, all);
    }

    // Export PDF opens the browser's print dialog.
    await page.evaluate(() => {
      const counted = window as Window & { ukiPrints?: number };
      counted.ukiPrints = 0;
      window.print = () => {
        counted.ukiPrints = (counted.ukiPrints ?? 0) + 1;
      };
    });
    await page.getByRole("button", { name: message("dashboard.reports.export") }).click();
    expect(await page.evaluate(() => (window as Window & { ukiPrints?: number }).ukiPrints)).toBe(1);

    // Printing puts the reports page alone on one A4 sheet (Chromium's print to PDF, print media).
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: message("dashboard.reports.export") })).toBeHidden();
    await expect(page.getByRole("navigation")).toBeHidden();
    // The printout names the workspace, the faculty and the term above the tiles.
    await expect(page.locator("[data-print-root]").getByText(breadcrumb)).toBeVisible();
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: "screen" });
    const text = pdf.toString("latin1");
    expect(text.match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(1);
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
    expect(Number(box?.[1])).toBeCloseTo(595.28, 0);
    expect(Number(box?.[2])).toBeCloseTo(841.89, 0);
    await testInfo.attach("reports-a4.pdf", { body: pdf, contentType: "application/pdf" });
  } finally {
    await cleanUp("audit rows", [
      [
        "audit_log",
        () =>
          adminClient()
            .from("audit_log")
            .delete()
            .eq("actor_id", danaId)
            .eq("action", "reports.read")
            .gte("at", since),
      ],
    ]);
  }
});

test("A.1 is the exam office's: a proctor gets the not-found page and no Reports item", async ({ page }) => {
  await signIn(page, STAFF.aigerim);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: message("dashboard.shell.nav.reports") }),
  ).toHaveCount(0);
  expect(await pageStatus(page, "/reports")).toBe(404);
});

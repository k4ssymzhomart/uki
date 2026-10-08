// WP 1.9's done-when on the seeded History of Kazakhstan, seat 33 (one phone flag, given a still here):
// review to report to share. Dana decides on 3.3, opens 3.4 from it, prints it on A4, exports its events
// as CSV and makes the share link; a browser context with no cookies opens 3.5 from the link with its
// still loading, with no-index, no-referrer and no-store, and each view writes an audit row; the link
// expired gets the not-found page, and so does a link withdrawn with Revoke on 3.4; /verify confirms
// the printed code (UKI-XXXX-XXXX, typed in lower case too), and once the report changes the old code
// no longer verifies; one client gets 10 lookups a minute and the 11th the try-again state (the user's
// decisions of 8 Oct). Everything the test adds is removed afterwards.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { signIn } from "./support/dashboard.ts";
import { message } from "./support/messages.ts";
import { EXAMS, STAFF } from "./support/seed.ts";
import { adminClient, cleanUp, staffClient, userIdsByEmail } from "./support/supabase.ts";

const HISTORY = EXAMS.history.id;
/** Seat 33 of History (supabase/seed.sql): one phone.detected flag, 0.91, at minute 20. */
const SESSION = "d0000000-0000-4000-8003-000000000033";
const FLAG = "e1000000-0000-4000-8003-000000000004";
const STILL_PATH = `${HISTORY}/${SESSION}/${FLAG}-0.jpg`;
const NOTE = "Phone face down after the warning.";
const CODE = /^UKI-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const CSV_HEADER = "at_utc,at_almaty,type,source,review,frame_count,received_at_utc,data";
/** A 64 x 36 JPEG, as the integration tests upload (test/integration/api.ts). */
const STILL = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRX1J88FFFFABRRRQAUUUUAXv7Qtf8AoDWX/fc//wAco/tC1/6A1l/33P8A/HKo0VHIv6bK5mXv7Qtf+gNZf99z/wDxyj+0LX/oDWX/AH3P/wDHKo0Uci/psOZl7+0LX/oDWX/fc/8A8co/tC1/6A1l/wB9z/8AxyqNFHIv6bDmZe/tC1/6A1l/33P/APHKP7Qtf+gNZf8Afc//AMcqjRRyL+mw5mFFFFWSFFFFABRRRQAUUUUAf//Z",
  "base64",
);

async function restore(): Promise<void> {
  const admin = adminClient();
  await cleanUp("report", [
    ["seat 33's report and its shares", () => admin.from("reports").delete().eq("session_id", SESSION)],
    ["seat 33's decision", () => admin.from("review_decisions").delete().eq("session_id", SESSION)],
    [
      "notes on seat 33",
      () => admin.from("events").delete().eq("session_id", SESSION).eq("type", "proctor.note"),
    ],
    ["the still's row", () => admin.from("frames").delete().eq("event_id", FLAG)],
    ["the flag's frame count", () => admin.from("events").update({ frame_count: 0 }).eq("id", FLAG)],
    [
      "History back to to_review",
      () => admin.from("exams").update({ status: "to_review" }).eq("id", HISTORY),
    ],
  ]);
  await admin.storage.from("frames").remove([STILL_PATH]);
}

/** The flag gets one still, as the app would have uploaded it (seed v1's flags have none). */
async function attachStill(): Promise<void> {
  const admin = adminClient();
  const { error: upload } = await admin.storage
    .from("frames")
    .upload(STILL_PATH, STILL, { contentType: "image/jpeg", upsert: true });
  if (upload) throw new Error(`e2e: still upload failed: ${upload.message}`);
  const { data: flag } = await admin.from("events").select("at").eq("id", FLAG).single();
  const { error: row } = await admin.from("frames").insert({
    id: randomUUID(),
    event_id: FLAG,
    session_id: SESSION,
    exam_id: HISTORY,
    storage_path: STILL_PATH,
    captured_at: flag?.at ?? new Date().toISOString(),
  });
  if (row) throw new Error(`e2e: frames row failed: ${row.message}`);
  const { error: count } = await admin.from("events").update({ frame_count: 1 }).eq("id", FLAG);
  if (count) throw new Error(`e2e: frame count failed: ${count.message}`);
}

async function shareViews(shareId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", "report.share_view")
    .eq("actor_kind", "share")
    .eq("meta->>share_id", shareId);
  if (error) throw new Error(`e2e: reading share views failed: ${error.message}`);
  return count ?? 0;
}

/** Every still on the report page has loaded (naturalWidth > 0). */
async function stillsLoaded(page: Page, count: number): Promise<void> {
  const stills = page.locator("article img[referrerpolicy='no-referrer']");
  await expect(stills).toHaveCount(count);
  await expect
    .poll(() => stills.evaluateAll((images) => images.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
}

/**
 * A browser context with no cookies at all: a committee member without an Üki account. Each one comes
 * from its own address (x-forwarded-for, which the Next.js server hashes for /verify's limit), so its
 * lookups never share a count with another test's or another run's.
 */
async function visitor(browser: Browser, viewport = { width: 1280, height: 800 }) {
  const id = randomUUID();
  const address = `2001:db8::${id.slice(0, 4)}:${id.slice(9, 13)}`;
  const context = await browser.newContext({
    viewport,
    locale: "en-GB",
    timezoneId: "Asia/Almaty",
    extraHTTPHeaders: { "x-forwarded-for": address },
  });
  return { context, page: await context.newPage() };
}

async function revokes(shareId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", "report.share_revoke")
    .eq("meta->>share_id", shareId);
  if (error) throw new Error(`e2e: reading revokes failed: ${error.message}`);
  return count ?? 0;
}

test.beforeAll(async () => {
  await restore();
  await attachStill();
});

test.afterAll(async () => {
  await restore();
});

test("review to report to share: 3.4 prints and exports, 3.5 opens without sign-in, the code verifies", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(600_000);
  await signIn(page, STAFF.dana);
  const [danaId] = [...(await userIdsByEmail([STAFF.dana])).values()];

  // 3.3: decide, then open the report from the session.
  await page.goto(`/review/${SESSION}`);
  await page.getByRole("radio", { name: /Talk to the student/ }).click();
  await page.getByLabel(message("dashboard.review.session.note"), { exact: true }).fill(NOTE);
  await page.getByRole("button", { name: message("dashboard.review.session.save") }).click();
  await expect(page).not.toHaveURL(new RegExp(`/review/${SESSION}$`));
  await page.goto(`/review/${SESSION}`);
  await page.getByRole("link", { name: message("dashboard.report.title") }).click();
  await expect(page).toHaveURL(new RegExp(`/review/${SESSION}/report$`));

  // 3.4: the report with its verify code, the flag's still, the decision; get_report audited the read.
  const report = page.getByRole("article");
  await expect(
    report.getByRole("heading", { level: 2, name: message("dashboard.report.title") }),
  ).toBeVisible();
  const printed = (await page.getByTestId("report-verify-code").textContent()) ?? "";
  expect(printed).toMatch(CODE);
  const { data: stored } = await adminClient()
    .from("reports")
    .select("id, verify_code")
    .eq("session_id", SESSION)
    .single();
  expect(printed.replace(/^UKI-|-/g, "")).toBe(stored?.verify_code);
  await stillsLoaded(page, 1);
  await expect(report.getByText("Talk to the student")).toBeVisible();
  await expect(report.getByText(NOTE)).toBeVisible();
  const { data: views } = await adminClient()
    .from("audit_log")
    .select("actor_id")
    .eq("action", "report.view")
    .eq("object_id", SESSION);
  expect(views?.some((row) => row.actor_id === danaId)).toBe(true);

  // Export CSV: the session's events, built in the browser.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: message("dashboard.report.export.csv") }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`uki-report-${printed}-events.csv`);
  const csv = readFileSync((await download.path()) ?? "", "utf8").split("\r\n");
  const { count: events } = await adminClient()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("session_id", SESSION);
  expect(csv[0]).toBe(CSV_HEADER);
  expect(csv.filter((line) => line !== "")).toHaveLength((events ?? 0) + 1);
  expect(csv.some((line) => line.includes(",phone.detected,app,flag,1,"))).toBe(true);

  // Download PDF prints the report page alone on A4 (Chromium's print to PDF, print media).
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: message("dashboard.report.export.pdf") })).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  const text = pdf.toString("latin1");
  const pages = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
  expect(pages).toHaveLength(1);
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  expect(Number(box?.[1])).toBeCloseTo(595.28, 0);
  expect(Number(box?.[2])).toBeCloseTo(841.89, 0);
  await testInfo.attach("report-a4.pdf", { body: pdf, contentType: "application/pdf" });

  // Share link: shown once, for 30 days; only the token's SHA-256 is stored.
  await expect(page.getByRole("button", { name: message("dashboard.report.share.label") })).toHaveText(
    "Read-only link · expires in 30 days",
  );
  await expect(page.getByTestId("share-revoke")).toHaveCount(0);
  await page.getByRole("button", { name: message("dashboard.report.share.label") }).click();
  const field = page.getByTestId("share-link");
  await expect(field).toBeVisible();
  const link = await field.inputValue();
  const token = new URL(link).pathname.replace(/^\/r\//, "");
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const { data: shares } = await adminClient()
    .from("report_shares")
    .select("id, token_hash, expires_at, created_by")
    .eq("report_id", stored?.id ?? "");
  expect(shares).toHaveLength(1);
  const share = shares?.[0];
  expect(share?.token_hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
  expect(share?.created_by).toBe(danaId);
  const days = (Date.parse(share?.expires_at ?? "") - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThanOrEqual(30);
  expect(JSON.stringify(shares)).not.toContain(token);
  const shareId = share?.id ?? "";

  // 3.5 in a context with no cookies: no sign-in, the still loads, no-index, no-referrer, no-store.
  const committee = await visitor(browser);
  const opened = await committee.page.goto(link);
  expect(opened?.status()).toBe(200);
  const headers = opened?.headers() ?? {};
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["x-robots-tag"]).toContain("noindex");
  await expect(committee.page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(committee.page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(committee.page).toHaveURL(link);
  await expect(
    committee.page.getByRole("heading", { level: 1, name: message("dashboard.report.title") }),
  ).toBeVisible();
  await expect(committee.page.getByText(/^Read-only\. Shared by Dana Akhmetova/)).toBeVisible();
  await expect(committee.page.getByText(printed).first()).toBeVisible();
  await stillsLoaded(committee.page, 1);
  expect((await committee.context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);
  expect(await shareViews(shareId)).toBe(1);
  await committee.page.reload();
  await stillsLoaded(committee.page, 1);
  expect(await shareViews(shareId)).toBe(2);

  // The same link on a phone: one column, nothing wider than the screen.
  const phone = await visitor(browser, { width: 390, height: 844 });
  await phone.page.goto(link);
  await stillsLoaded(phone.page, 1);
  expect(await phone.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await phone.context.close();
  expect(await shareViews(shareId)).toBe(3);

  // /verify/[code] confirms the printout, with no session, typed in lower case too.
  await committee.page.goto(new URL(`/verify/${printed}`, link).toString());
  await expect(committee.page.getByRole("status")).toHaveAttribute("data-result", "intact");
  await committee.page.goto(new URL(`/verify/${printed.toLowerCase()}`, link).toString());
  await expect(committee.page.getByRole("status")).toHaveAttribute("data-result", "intact");
  await expect(committee.page.getByText(printed)).toBeVisible();

  // Expired: the not-found page, and no audit row.
  await adminClient()
    .from("report_shares")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", shareId);
  const expired = await committee.page.goto(link);
  expect(expired?.status()).toBe(404);
  await expect(committee.page.getByText(message("dashboard.report.notFound.title"))).toBeVisible();
  expect(await shareViews(shareId)).toBe(3);

  // Revoke: a new link opens; after a reload of 3.4 (the link is no longer shown) Revoke withdraws it,
  // and the link gets the not-found page with no audit row of a view.
  await page.reload();
  await expect(page.getByTestId("share-revoke")).toHaveCount(0);
  await page.getByRole("button", { name: message("dashboard.report.share.label") }).click();
  const second = await page.getByTestId("share-link").inputValue();
  const { data: secondRow } = await adminClient()
    .from("report_shares")
    .select("id")
    .eq("token_hash", createHash("sha256").update(new URL(second).pathname.slice(3), "utf8").digest("hex"))
    .single();
  const secondId = secondRow?.id ?? "";
  expect((await committee.page.goto(second))?.status()).toBe(200);
  expect(await shareViews(secondId)).toBe(1);
  await page.reload();
  await expect(page.getByTestId("share-link")).toHaveCount(0);
  await expect(page.getByText("1 active link")).toBeVisible();
  await page.getByRole("button", { name: message("dashboard.report.share.revokeLabel") }).click();
  await expect(page.getByText("1 link revoked")).toBeVisible();
  await expect(page.getByTestId("share-revoke")).toHaveCount(0);
  const { data: revokedRow } = await adminClient()
    .from("report_shares")
    .select("revoked_at")
    .eq("id", secondId)
    .single();
  expect(revokedRow?.revoked_at).not.toBeNull();
  expect(await revokes(secondId)).toBe(1);
  expect(await revokes(shareId)).toBe(0);
  const withdrawn = await committee.page.goto(second);
  expect(withdrawn?.status()).toBe(404);
  await expect(committee.page.getByText(message("dashboard.report.notFound.title"))).toBeVisible();
  expect(await shareViews(secondId)).toBe(1);

  // The report changes (a note), so the printed code no longer verifies; the next view issues a new one.
  const dana = await staffClient(STAFF.dana);
  const { error: noteError } = await dana.client.rpc("add_session_note", { session_id: SESSION, text: NOTE });
  expect(noteError).toBeNull();
  await dana.client.auth.signOut();
  await committee.page.goto(new URL(`/verify/${printed}`, link).toString());
  await expect(committee.page.getByRole("status")).toHaveAttribute("data-result", "not-verified");
  await page.reload();
  const reissued = (await page.getByTestId("report-verify-code").textContent()) ?? "";
  expect(reissued).toMatch(CODE);
  expect(reissued).not.toBe(printed);
  await committee.page.goto(new URL(`/verify/${reissued}`, link).toString());
  await expect(committee.page.getByRole("status")).toHaveAttribute("data-result", "intact");
  await committee.page.goto(new URL(`/verify/${printed}`, link).toString());
  await expect(committee.page.getByRole("status")).toHaveAttribute("data-result", "not-verified");
  await committee.context.close();
});

test("/verify accepts a code in lower case and answers one client 10 lookups a minute", async ({
  browser,
}) => {
  // Seat 33's report from the test above, or made here when this test runs alone.
  const dana = await staffClient(STAFF.dana);
  const { error: reportError } = await dana.client.rpc("get_report", { session_id: SESSION });
  expect(reportError).toBeNull();
  await dana.client.auth.signOut();
  const { data: stored } = await adminClient()
    .from("reports")
    .select("verify_code")
    .eq("session_id", SESSION)
    .single();
  const code = stored?.verify_code ?? "";
  const typed = `uki-${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();

  const one = await visitor(browser);
  for (let lookup = 1; lookup <= 10; lookup += 1) {
    await one.page.goto(`/verify/${lookup % 2 === 0 ? typed : code.toLowerCase()}`);
    await expect(one.page.getByRole("status")).toHaveAttribute("data-result", "intact");
  }
  await expect(one.page.getByText(`UKI-${code.slice(0, 4)}-${code.slice(4)}`)).toBeVisible();

  // The 11th lookup within the minute: the try-again state, with the code that was asked.
  await one.page.goto(`/verify/${typed}`);
  const status = one.page.getByRole("status");
  await expect(status).toHaveAttribute("data-result", "rate-limited");
  await expect(status).toHaveText(message("dashboard.report.verify.limited"));
  await expect(
    one.page.getByRole("link", { name: message("dashboard.report.verify.tryAgain") }),
  ).toHaveAttribute("href", `/verify/${typed}`);

  // Another visitor is still answered.
  const other = await visitor(browser);
  await other.page.goto(`/verify/${typed}`);
  await expect(other.page.getByRole("status")).toHaveAttribute("data-result", "intact");
  await one.context.close();
  await other.context.close();
});

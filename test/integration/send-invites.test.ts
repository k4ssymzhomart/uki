// send-invites against the local stack and the Resend stub (Phase 1 plan, Testing: Edge Functions):
// a full send in batches of up to 100, each email in its student's language; nothing sent twice; a
// refused batch marking its invites failed and a second call sending them; a resend by student id;
// the test invite to the signed-in staff member only; a draft exam; the sink; and the rights (another
// workspace's exam office, a proctor of the exam and a student are refused, and no token is 401).
//
// The served functions' env file says where the stub listens and whether UKI_EMAIL_SINK is set
// (readFunctionsEnv). Run it once with each: supabase/functions/local.env has no sink; CI runs this
// file again with a sink (.github/workflows/ci.yml).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildExamCode, type InviteState, SendInvitesOutput } from "../../packages/contracts/src/index.ts";
import type { UkiClient } from "../../packages/db/src/index.ts";
import { inviteTimes, renderInvite } from "../../supabase/functions/send-invites/email.tsx";
import { formatEmailMessage } from "../../supabase/functions/send-invites/messages.ts";
import { call, errorCode } from "./api.ts";
import {
  type FunctionsEnv,
  type ResendStub,
  readFunctionsEnv,
  type StubEmail,
  startResendStub,
} from "./resend-stub.ts";
import { adminClient, publicClient } from "./world.ts";

const LOCALES = ["kk", "ru", "en"] as const;
type Locale = (typeof LOCALES)[number];
const STUDENTS = 103;

interface Person {
  id: string;
  email: string;
  token: string;
  client: UkiClient;
}

interface FixtureStudent {
  id: string;
  name: string;
  number: string;
  email: string;
  locale: Locale;
  group: string | null;
  seat: number;
}

let env: FunctionsEnv;
let stub: ResendStub;
const admin = adminClient();
const runId = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const authUsers: string[] = [];
const workspaces: string[] = [];
let office: Person;
let otherOffice: Person;
let proctor: Person;
let student: Person;
let examId: string;
let draftId: string;
let examCode: string;
let groupCode: string;
const startsAt = new Date(Math.ceil(Date.now() / 86_400_000 + 7) * 86_400_000 + 5 * 3_600_000);
const lobbyOpensAt = new Date(startsAt.getTime() - 20 * 60_000);
const students: FixtureStudent[] = [];

function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`send-invites fixture: ${what} failed: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

async function staffMember(
  label: string,
  workspaceId: string,
  role: "exam_office" | "proctor",
  languages: Locale[],
): Promise<Person> {
  const email = `${label}.${runId.toLowerCase()}@it.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = must({ data: created.data.user, error: created.error }, `auth user ${label}`).id;
  authUsers.push(id);
  must(
    await admin
      .from("staff")
      .insert({ id, workspace_id: workspaceId, full_name: `${label} ${runId}`, role, languages })
      .select(),
    `staff ${label}`,
  );
  const client = publicClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  const token = must({ data: signIn.data.session, error: signIn.error }, `sign-in ${label}`).access_token;
  return { id, email, token, client };
}

async function workspace(label: string): Promise<string> {
  const row = must(
    await admin
      .from("workspaces")
      .insert({ name: `KRU ${label} ${runId}`, slug: `it-inv-${label}-${runId.toLowerCase()}` })
      .select("id")
      .single(),
    `workspace ${label}`,
  );
  workspaces.push(row.id);
  return row.id;
}

async function exam(workspaceId: string, groupId: string, status: "scheduled" | "draft"): Promise<string> {
  const row = must(
    await admin
      .from("exams")
      .insert({
        workspace_id: workspaceId,
        title: `Mathematics 2 · Midterm ${runId}`,
        course: "Mathematics 2",
        kind: "Midterm",
        code: status === "draft" ? null : examCode,
        mode: "app",
        starts_at: startsAt.toISOString(),
        duration_min: 90,
        lobby_opens_at: lobbyOpensAt.toISOString(),
        status,
      })
      .select("id")
      .single(),
    `exam ${status}`,
  );
  must(await admin.from("exam_groups").insert({ exam_id: row.id, group_id: groupId }).select(), "exam group");
  return row.id;
}

beforeAll(async () => {
  env = readFunctionsEnv();
  stub = await startResendStub(env.port);

  const ws = await workspace("main");
  const other = await workspace("other");
  groupCode = `2${runId.slice(0, 2)}`;
  const group = must(
    await admin.from("groups").insert({ workspace_id: ws, code: groupCode }).select("id").single(),
    "group",
  );
  examCode = `IT${runId}-FRI`;
  examId = await exam(ws, group.id, "scheduled");
  draftId = await exam(ws, group.id, "draft");

  const base = 70_000_000 + Math.floor(Math.random() * 9_000_000);
  for (let i = 0; i < STUDENTS; i += 1) {
    students.push({
      id: "",
      // One name with the characters HTML escapes, so the template fill is checked too.
      name: i === 1 ? `Aisha O'Neil & <Co> ${runId}` : `Student ${i} ${runId}`,
      number: String(base + i),
      email: `s${i}.${runId.toLowerCase()}@it.test`,
      locale: LOCALES[i % 3] ?? "kk",
      // The last student has no group: the footer names the roster instead.
      group: i === STUDENTS - 1 ? null : groupCode,
      seat: i + 1,
    });
  }
  const rows = must(
    await admin
      .from("students")
      .insert(
        students.map((s) => ({
          workspace_id: ws,
          student_number: s.number,
          full_name: s.name,
          email: s.email,
          locale: s.locale,
          group_id: s.group === null ? null : group.id,
        })),
      )
      .select("id, student_number"),
    "students",
  );
  for (const row of rows) {
    const found = students.find((s) => s.number === row.student_number);
    if (found) found.id = row.id;
  }
  for (const id of [examId, draftId]) {
    must(
      await admin
        .from("exam_students")
        .insert(students.map((s) => ({ exam_id: id, student_id: s.id, seat: s.seat })))
        .select(),
      "roster",
    );
  }
  must(
    await admin
      .from("invites")
      .insert(students.map((s) => ({ exam_id: examId, student_id: s.id, email: s.email, locale: s.locale })))
      .select(),
    "invites",
  );

  office = await staffMember("office", ws, "exam_office", ["kk", "ru"]);
  otherOffice = await staffMember("elsewhere", other, "exam_office", ["ru"]);
  proctor = await staffMember("proctor", ws, "proctor", ["ru"]);
  must(
    await admin
      .from("proctor_assignments")
      .insert({
        exam_id: examId,
        staff_id: proctor.id,
        languages: ["ru"],
        is_lead: true,
        seat_from: 1,
        seat_to: STUDENTS,
      })
      .select(),
    "assignment",
  );
  const anon = publicClient();
  const signedIn = must(await anon.auth.signInAnonymously(), "anonymous sign-in");
  if (!signedIn.user || !signedIn.session) throw new Error("no anonymous session");
  authUsers.push(signedIn.user.id);
  student = { id: signedIn.user.id, email: "", token: signedIn.session.access_token, client: anon };
});

afterAll(async () => {
  await stub?.close();
  for (const id of [examId, draftId]) {
    if (!id) continue;
    await admin.from("proctor_assignments").delete().eq("exam_id", id);
    await admin.from("exam_students").delete().eq("exam_id", id);
    await admin.from("exam_groups").delete().eq("exam_id", id);
    await admin.from("exams").delete().eq("id", id);
  }
  for (const ws of workspaces) {
    await admin.from("students").delete().eq("workspace_id", ws);
    await admin.from("staff").delete().eq("workspace_id", ws);
    await admin.from("groups").delete().eq("workspace_id", ws);
    await admin.from("audit_log").delete().eq("workspace_id", ws);
    await admin.from("workspaces").delete().eq("id", ws);
  }
  for (const id of authUsers) await admin.auth.admin.deleteUser(id);
});

beforeEach(() => {
  stub.reset();
});

async function send(body: unknown, token: string | null = office.token) {
  return call("send-invites", body, token);
}

async function invites() {
  const { data, error } = await admin
    .from("invites")
    .select("student_id, state, provider_id, error, sent_at, email")
    .eq("exam_id", examId);
  if (error) throw error;
  return new Map(data.map((row) => [row.student_id, row]));
}

async function inviteStatus() {
  const { data, error } = await admin
    .from("exam_students")
    .select("student_id, invite_status")
    .eq("exam_id", examId);
  if (error) throw error;
  return new Map(data.map((row) => [row.student_id, row.invite_status]));
}

async function setStates(state: InviteState, ids?: string[]) {
  let query = admin
    .from("invites")
    .update({ state, provider_id: null, error: null, sent_at: null })
    .eq("exam_id", examId);
  if (ids) query = query.in("student_id", ids);
  const { error } = await query;
  if (error) throw error;
}

/** Whose email this is, from the student number printed in the code box. */
function owner(email: StubEmail): FixtureStudent {
  const found = students.find((s) => email.html.includes(`>${s.number}<`));
  if (!found) throw new Error(`no fixture student in "${email.subject}"`);
  return found;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");

function expectInviteFor(email: StubEmail, s: FixtureStudent) {
  const title = `Mathematics 2 · Midterm ${runId}`;
  expect(email.to).toEqual([env.sink ?? s.email]);
  expect(email.subject).toBe(formatEmailMessage(s.locale, "email.invite.subject", { exam: title }));
  expect(email.html).toContain(`lang="${s.locale}"`);
  expect(email.html).toContain(`>${examCode}<`);
  expect(email.html).toContain(escapeHtml(s.name));
  expect(email.text).toContain(s.name);
  expect(email.text).toContain(examCode);
  expect(email.text).toContain(s.number);
  const times = inviteTimes({
    title,
    code: examCode,
    startsAt: startsAt.toISOString(),
    lobbyOpensAt: lobbyOpensAt.toISOString(),
    timeZone: "Asia/Almaty",
  });
  expect(email.text).toContain(
    formatEmailMessage(s.locale, "email.invite.title", { weekday: times.weekday, time: times.time }),
  );
  const footer =
    s.group === null
      ? formatEmailMessage(s.locale, "email.invite.footer_roster", {
          name: s.name,
          office: `KRU main ${runId}`,
        })
      : formatEmailMessage(s.locale, "email.invite.footer_group", {
          name: s.name,
          office: `KRU main ${runId}`,
          group: s.group,
        });
  expect(email.text).toContain(footer);
  // No tracking: every image is one of the three static files, and the only link is the download.
  const images = [...email.html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of images) {
    expect(src).toMatch(/\/email\/(uki-wordmark|uki-mascot-hello|icon-lock)\.png$/);
    if (env.webUrl) expect(src?.startsWith(`${env.webUrl}/email/`)).toBe(true);
  }
  const links = [...email.html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  expect(links).toHaveLength(1);
}

describe("send-invites: who may send", () => {
  it("answers 401 without a token", async () => {
    const reply = await send({ exam_id: examId }, null);
    expect(reply.status).toBe(401);
  });

  it.each([
    ["a student", () => student.token],
    ["a proctor of the exam", () => proctor.token],
    ["another workspace's exam office", () => otherOffice.token],
  ])("refuses %s, and nothing reaches Resend", async (_who, token) => {
    for (const body of [{ exam_id: examId }, { exam_id: examId, test: true }]) {
      const reply = await send(body, token());
      expect(reply.status).toBe(403);
      expect(errorCode(reply)).toBe("forbidden");
    }
    expect(stub.batches).toHaveLength(0);
    const states = await invites();
    expect([...states.values()].every((row) => row.state === "pending")).toBe(true);
  });

  it("refuses a body that is not the plan's input", async () => {
    for (const body of [
      {},
      { exam_id: "nope" },
      { exam_id: examId, test: false },
      { exam_id: examId, student_ids: [] },
    ]) {
      const reply = await send(body);
      expect(reply.status).toBe(400);
    }
  });
});

describe("send-invites: a full send", () => {
  it("sends every pending invite in batches of up to 100, each in its student's language", async () => {
    const reply = await send({ exam_id: examId });
    expect(reply.status).toBe(200);
    const body = SendInvitesOutput.parse(reply.body);
    expect(body).toEqual({ sent: STUDENTS, failed: [] });

    expect(stub.batches.map((batch) => batch.emails.length)).toEqual([100, STUDENTS - 100]);
    for (const batch of stub.batches) expect(batch.authorization).toBe(`Bearer ${env.apiKey}`);
    const emails = stub.emails();
    expect(new Set(emails.map((email) => owner(email).id)).size).toBe(STUDENTS);
    for (const email of emails) expectInviteFor(email, owner(email));

    const ids = new Map(
      stub.batches.flatMap((batch) => batch.emails.map((email, i) => [owner(email).id, batch.ids[i]])),
    );
    const rows = await invites();
    const statuses = await inviteStatus();
    for (const s of students) {
      const row = rows.get(s.id);
      expect(row?.state).toBe("sent");
      expect(row?.provider_id).toBe(ids.get(s.id));
      expect(row?.error).toBeNull();
      expect(row?.sent_at).not.toBeNull();
      expect(statuses.get(s.id)).toBe("sent");
    }

    const audit = await admin
      .from("audit_log")
      .select("action, object_type, object_id, actor_id, meta")
      .eq("actor_id", office.id)
      .eq("action", "invites.send");
    expect(audit.data).toHaveLength(1);
    expect(audit.data?.[0]).toMatchObject({
      object_type: "exam",
      object_id: examId,
      meta: { students: STUDENTS, sent: STUDENTS, failed: 0, sink: env.sink !== null },
    });
  });

  it("sends nothing again once every invite is sent", async () => {
    const reply = await send({ exam_id: examId });
    expect(SendInvitesOutput.parse(reply.body)).toEqual({ sent: 0, failed: [] });
    expect(stub.batches).toHaveLength(0);
  });

  it("writes the same email under Deno as the Node render the snapshots hold", async () => {
    const target = students[1];
    if (!target) throw new Error("no student 1");
    const reply = await send({ exam_id: examId, student_ids: [target.id] });
    expect(SendInvitesOutput.parse(reply.body).sent).toBe(1);
    const [email] = stub.emails();
    const node = await renderInvite(
      target.locale,
      {
        title: `Mathematics 2 · Midterm ${runId}`,
        code: examCode,
        startsAt: startsAt.toISOString(),
        lobbyOpensAt: lobbyOpensAt.toISOString(),
        timeZone: "Asia/Almaty",
      },
      { name: target.name, number: target.number, group: target.group },
      {
        office: `KRU main ${runId}`,
        downloadUrl: "https://github.com/k4ssymzhomart/uki/releases/latest",
        assetsUrl: env.webUrl === null ? null : `${env.webUrl}/email`,
        test: false,
      },
    );
    expect(email?.html).toBe(node.html);
    expect(email?.text).toBe(node.text);
  });
});

describe("send-invites: failures and resends", () => {
  it("marks every invite of a refused batch failed, and the next call sends them", async () => {
    await setStates("pending");
    stub.refuseWhen((index) =>
      index === 1 ? { status: 422, name: "validation_error", message: "Invalid `to` field." } : null,
    );
    const reply = await send({ exam_id: examId });
    expect(reply.status).toBe(200);
    const body = SendInvitesOutput.parse(reply.body);
    expect(body.sent).toBe(100);
    expect(body.failed).toHaveLength(STUDENTS - 100);
    for (const entry of body.failed) expect(entry.error).toBe("Resend 422: Invalid `to` field.");

    const refused = new Set(stub.batches[1]?.emails.map((email) => owner(email).id));
    expect(new Set(body.failed.map((entry) => entry.student_id))).toEqual(refused);
    const rows = await invites();
    const statuses = await inviteStatus();
    for (const s of students) {
      const failed = refused.has(s.id);
      expect(rows.get(s.id)?.state).toBe(failed ? "failed" : "sent");
      expect(rows.get(s.id)?.error).toBe(failed ? "Resend 422: Invalid `to` field." : null);
      expect(rows.get(s.id)?.provider_id ?? null).toSatisfy((id: string | null) =>
        failed ? id === null : id !== null,
      );
      expect(statuses.get(s.id)).toBe(failed ? "failed" : "sent");
    }

    stub.reset();
    const again = await send({ exam_id: examId });
    expect(SendInvitesOutput.parse(again.body)).toEqual({ sent: STUDENTS - 100, failed: [] });
    expect(new Set(stub.emails().map((email) => owner(email).id))).toEqual(refused);
    const after = await invites();
    expect([...after.values()].every((row) => row.state === "sent" && row.error === null)).toBe(true);
  });

  it("marks the batch failed when Resend answers 500", async () => {
    const target = students[0];
    if (!target) throw new Error("no student 0");
    stub.refuseWhen(() => ({ status: 500, name: "internal_server_error", message: "Something went wrong." }));
    const reply = await send({ exam_id: examId, student_ids: [target.id] });
    expect(SendInvitesOutput.parse(reply.body)).toEqual({
      sent: 0,
      failed: [{ student_id: target.id, error: "Resend 500: Something went wrong." }],
    });
    expect((await invites()).get(target.id)?.state).toBe("failed");
    expect((await inviteStatus()).get(target.id)).toBe("failed");
  });

  it("sends the named students' invites again, whatever their state, and names a student without one", async () => {
    const [first, second] = students;
    if (!first || !second) throw new Error("need two students");
    const stranger = randomUUID();
    const before = await invites();
    const reply = await send({ exam_id: examId, student_ids: [first.id, second.id, stranger] });
    expect(SendInvitesOutput.parse(reply.body)).toEqual({
      sent: 2,
      failed: [{ student_id: stranger, error: "no invite for this student on the exam" }],
    });
    expect(stub.batches).toHaveLength(1);
    expect(
      stub
        .emails()
        .map((email) => owner(email).id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    const after = await invites();
    expect(after.get(second.id)?.provider_id).not.toBe(before.get(second.id)?.provider_id);
    expect(after.get(first.id)?.state).toBe("sent");
  });
});

describe("send-invites: the test invite", () => {
  it("goes to the signed-in staff member only, in their first language, and records nothing", async () => {
    const before = await invites();
    const reply = await send({ exam_id: examId, test: true });
    expect(SendInvitesOutput.parse(reply.body)).toEqual({ sent: 1, failed: [] });
    expect(stub.batches).toHaveLength(1);
    const [email] = stub.emails();
    if (!email) throw new Error("no test email");
    expect(email.to).toEqual([env.sink ?? office.email]);
    expect(email.subject).toBe(
      formatEmailMessage("kk", "email.invite.test_subject", { exam: `Mathematics 2 · Midterm ${runId}` }),
    );
    expect(email.html).toContain('lang="kk"');
    // Filled with the first student of the roster, as students see it.
    expect(owner(email).seat).toBe(1);
    expect(await invites()).toEqual(before);

    const audit = await admin
      .from("audit_log")
      .select("meta")
      .eq("actor_id", office.id)
      .eq("action", "invites.test");
    expect(audit.data?.at(-1)?.meta).toMatchObject({ locale: "kk", sent: 1 });
  });

  it("works on a draft with the code schedule_exam will make, while real invites wait for Schedule", async () => {
    const reply = await send({ exam_id: draftId, test: true });
    expect(SendInvitesOutput.parse(reply.body)).toEqual({ sent: 1, failed: [] });
    const expected = buildExamCode({
      course: "Mathematics 2",
      groups: [groupCode],
      startsAt,
      timeZone: "Asia/Almaty",
    });
    expect(stub.emails()[0]?.html).toContain(`>${expected}<`);

    const real = await send({ exam_id: draftId });
    expect(real.status).toBe(409);
    expect(errorCode(real)).toBe("conflict");
    expect(stub.batches).toHaveLength(1);
  });

  it("reports a refused test invite with no student", async () => {
    stub.refuseWhen(() => ({
      status: 403,
      name: "validation_error",
      message: "You can only send testing emails to your own email address.",
    }));
    const reply = await send({ exam_id: examId, test: true });
    expect(SendInvitesOutput.parse(reply.body)).toEqual({
      sent: 0,
      failed: [
        {
          student_id: null,
          error: "Resend 403: You can only send testing emails to your own email address.",
        },
      ],
    });
  });
});

describe("send-invites: where the emails go", () => {
  it("sends each email to the sink when UKI_EMAIL_SINK is set, else to the student, written for the student either way", async () => {
    await setStates(
      "pending",
      students.slice(0, 3).map((s) => s.id),
    );
    const reply = await send({ exam_id: examId });
    expect(SendInvitesOutput.parse(reply.body).sent).toBe(3);
    const emails = stub.emails();
    expect(emails).toHaveLength(3);
    for (const email of emails) {
      const s = owner(email);
      expect(email.to).toEqual([env.sink ?? s.email]);
      expectInviteFor(email, s);
    }
    // The three are in three languages.
    expect(new Set(emails.map((email) => owner(email).locale))).toEqual(new Set(LOCALES));
  });
});

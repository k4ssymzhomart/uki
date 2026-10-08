import { describe, expect, it } from "vitest";
import { pgTime, T0 } from "../test/fixtures.ts";
import { uuidv7 } from "./ids.ts";
import {
  AuditReadInput,
  DATA_REQUEST_DUE_DAYS,
  DataRequest,
  DataRequestActionInput,
  EXPORT_LINK_TTL_S,
  exportPath,
  PILOT_REQUESTS_PER_EMAIL_PER_DAY,
  PilotRequestInput,
  PilotRequestOutput,
  RETENTION_CRON,
  retentionDeadline,
} from "./privacy.ts";

describe("data requests (A.5, A.5a, A.5b)", () => {
  it("reads a request row", () => {
    const row = {
      id: uuidv7(),
      workspace_id: uuidv7(),
      student_id: uuidv7(),
      kind: "delete",
      status: "received",
      received_at: pgTime(T0),
      due_at: pgTime(T0 + DATA_REQUEST_DUE_DAYS * 86_400_000),
      reply: null,
      export_path: null,
      done_by: null,
      done_at: null,
    };
    expect(DataRequest.parse(row)).toEqual(row);
    expect(DataRequest.safeParse({ ...row, kind: "erase" }).success).toBe(false);
  });

  it("takes delete, copy, or a reply with its text", () => {
    const id = uuidv7();
    expect(DataRequestActionInput.safeParse({ request_id: id, action: "delete" }).success).toBe(true);
    expect(DataRequestActionInput.safeParse({ request_id: id, action: "copy" }).success).toBe(true);
    expect(DataRequestActionInput.safeParse({ request_id: id, action: "reply" }).success).toBe(false);
    expect(
      DataRequestActionInput.safeParse({ request_id: id, action: "reply", reply: "Kept: exam result." })
        .success,
    ).toBe(true);
  });

  it("puts one JSON file per request in the exports bucket, linked for 7 days", () => {
    expect(exportPath("A0000000-0000-4000-8000-000000000001", "B1")).toBe(
      "a0000000-0000-4000-8000-000000000001/b1.json",
    );
    expect(EXPORT_LINK_TTL_S).toBe(604_800);
  });
});

describe("retention", () => {
  it("runs nightly at 22:00 UTC and frees a still after retention_days", () => {
    expect(RETENTION_CRON).toBe("0 22 * * *");
    expect(retentionDeadline("2026-10-09T10:47:10Z", 90).toISOString()).toBe("2027-01-07T10:47:10.000Z");
  });
});

describe("pilot requests (Book a pilot)", () => {
  it("checks the form like request_pilot", () => {
    const form = {
      name: "Dana Akhmetova",
      email: " Dana.Akhmetova@KRU.test ",
      university: "KRU · Kostanay",
      role: "Exam office",
      exam_size: "100–300",
      pilot_month: "November 2026",
      message: "Midterms for the Faculty of Mathematics, 4 groups, mostly students' own laptops.",
      demo_invite: true,
    };
    expect(PilotRequestInput.parse(form).email).toBe("dana.akhmetova@kru.test");
    expect(PilotRequestInput.safeParse({ ...form, message: "x".repeat(501) }).success).toBe(false);
    expect(PilotRequestInput.safeParse({ ...form, email: "dana" }).success).toBe(false);
    expect(PilotRequestInput.safeParse({ ...form, name: " " }).success).toBe(false);
    expect(PilotRequestInput.safeParse({ name: "A", email: "a@b.kz", university: "U" }).success).toBe(true);
    expect(PILOT_REQUESTS_PER_EMAIL_PER_DAY).toBe(3);
  });

  it("answers ok or rate_limited", () => {
    expect(PilotRequestOutput.parse({ status: "rate_limited" }).status).toBe("rate_limited");
    expect(PilotRequestOutput.safeParse({ status: "error" }).success).toBe(false);
  });
});

describe("audit_read", () => {
  it("takes a dotted action and a known object type", () => {
    expect(
      AuditReadInput.safeParse({ action: "student.view", object_type: "student", object_id: uuidv7() })
        .success,
    ).toBe(true);
    expect(AuditReadInput.safeParse({ action: "view", object_type: "student" }).success).toBe(false);
    expect(AuditReadInput.safeParse({ action: "student.view", object_type: "staff" }).success).toBe(false);
  });
});

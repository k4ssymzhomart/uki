import { describe, expect, it } from "vitest";
import { INVITE_BATCH_SIZE, inviteBatches, SendInvitesInput, SendInvitesOutput } from "./invites.ts";

const EXAM = "0192f000-0000-7000-8000-000000000001";
const STUDENT = "0192f000-0000-7000-8000-000000000002";

describe("SendInvitesInput", () => {
  it("takes an exam, an exam with students, or a test", () => {
    expect(SendInvitesInput.parse({ exam_id: EXAM })).toEqual({ exam_id: EXAM });
    expect(SendInvitesInput.parse({ exam_id: EXAM, student_ids: [STUDENT] })).toEqual({
      exam_id: EXAM,
      student_ids: [STUDENT],
    });
    expect(SendInvitesInput.parse({ exam_id: EXAM, test: true })).toEqual({ exam_id: EXAM, test: true });
  });

  it.each([
    {},
    { exam_id: "nope" },
    { exam_id: EXAM, test: false },
    { exam_id: EXAM, student_ids: [] },
    { exam_id: EXAM, student_ids: ["nope"] },
    { exam_id: EXAM, test: true, student_ids: [STUDENT] },
    { exam_id: EXAM, extra: 1 },
  ])("refuses %j", (body) => {
    expect(SendInvitesInput.safeParse(body).success).toBe(false);
  });
});

describe("SendInvitesOutput", () => {
  it("lists failures with their student, or none for the test invite", () => {
    const reply = {
      sent: 2,
      failed: [
        { student_id: STUDENT, error: "Resend 422: Invalid" },
        { student_id: null, error: "x" },
      ],
    };
    expect(SendInvitesOutput.parse(reply)).toEqual(reply);
    expect(SendInvitesOutput.safeParse({ sent: -1, failed: [] }).success).toBe(false);
    expect(SendInvitesOutput.safeParse({ sent: 0, failed: [{ student_id: null, error: "" }] }).success).toBe(
      false,
    );
  });
});

describe("inviteBatches", () => {
  it("splits into Resend batches of at most 100, in order", () => {
    expect(INVITE_BATCH_SIZE).toBe(100);
    expect(inviteBatches([])).toEqual([]);
    expect(inviteBatches(Array.from({ length: 100 }, (_, i) => i)).map((b) => b.length)).toEqual([100]);
    const batches = inviteBatches(Array.from({ length: 250 }, (_, i) => i));
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(Array.from({ length: 250 }, (_, i) => i));
    expect(inviteBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(() => inviteBatches([1], 0)).toThrow(RangeError);
  });
});

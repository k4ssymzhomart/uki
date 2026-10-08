import { describe, expect, it } from "vitest";
import { monthLabel, pilotEmail } from "./email.ts";

const ROW = {
  id: "0199b6a4-6c1e-7b3a-9f2d-3c4b5a690142",
  name: "Dana Akhmetova",
  email: "dana.akhmetova@kru.test",
  university: "KRU · Kostanay",
  role: "exam_office",
  message: "Midterms for the Faculty of Mathematics, 4 groups, mostly students’ own laptops.",
  exam_size: "from100",
  pilot_month: "2026-11",
  demo_invite: true,
  created_at: "2026-10-08T10:47:10.000Z",
};

describe("pilot-notify's email", () => {
  it("lists the frame's answers in English with the visitor's words quoted as typed", () => {
    const email = pilotEmail(ROW);
    expect(email.subject).toBe("Pilot request: KRU · Kostanay");
    expect(email.text).toContain("Name: Dana Akhmetova\n");
    expect(email.text).toContain("Work email: dana.akhmetova@kru.test\n");
    expect(email.text).toContain("Role: Exam office\n");
    expect(email.text).toContain("Students in one exam: 100–300\n");
    expect(email.text).toContain("When: November 2026\n");
    expect(email.text).toContain("Demo Day invite: Yes, 16 October\n");
    expect(email.text).toContain("Anything we should know:\nMidterms for the Faculty of Mathematics");
    expect(email.text).toContain(`Request ${ROW.id}.`);
  });

  it("leaves out the answers a visitor skipped and keeps unknown values as stored", () => {
    const email = pilotEmail({
      ...ROW,
      role: "rector",
      message: null,
      exam_size: null,
      pilot_month: null,
      demo_invite: false,
    });
    expect(email.text).toContain("Role: rector\n");
    expect(email.text).not.toContain("Students in one exam");
    expect(email.text).not.toContain("When:");
    expect(email.text).not.toContain("Anything we should know");
    expect(email.text).toContain("Demo Day invite: No\n");
  });

  it("names the month of a 2026-11 value", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(monthLabel("soon")).toBe("soon");
  });
});

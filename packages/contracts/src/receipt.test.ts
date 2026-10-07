import { describe, expect, it } from "vitest";
import {
  formatReceiptId,
  RECEIPT_ID_PATTERN,
  ReceiptId,
  receiptGroupCode,
  receiptInitials,
} from "./receipt.ts";

describe("receipt ids", () => {
  it("matches the plan's example", () => {
    expect(RECEIPT_ID_PATTERN.test("UKI-204-0942-MT")).toBe(true);
    expect(ReceiptId.safeParse("UKI-204-0942-MT").success).toBe(true);
  });

  it("refuses other shapes", () => {
    for (const id of [
      "UKI-204-942-MT",
      "UKI-204-0942-M",
      "uki-204-0942-MT",
      "UKI--0942-MT",
      "UKI-204-0942-МТ",
    ]) {
      expect(RECEIPT_ID_PATTERN.test(id), id).toBe(false);
    }
  });

  it("builds ids the way the database does", () => {
    expect(formatReceiptId({ groupCode: "204", number: 942, fullName: "Madina Tulegenova" })).toBe(
      "UKI-204-0942-MT",
    );
    expect(formatReceiptId({ groupCode: "ph-101", number: 7, fullName: "Aliya Seitkali" })).toBe(
      "UKI-PH101-0007-AS",
    );
    expect(formatReceiptId({ groupCode: null, number: 9999, fullName: "Dias" })).toBe("UKI-X-9999-DD");
  });

  it("derives initials from the first and last word, X outside A-Z", () => {
    expect(receiptInitials("  Arman   Bekzhanov ")).toBe("AB");
    expect(receiptInitials("Zhansaya Nurlanqyzy Omarova")).toBe("ZO");
    expect(receiptInitials("Әлия Сейтқали")).toBe("XX");
    expect(receiptInitials("")).toBe("XX");
    expect(receiptGroupCode("")).toBe("X");
    expect(receiptGroupCode("a-very-long-group-code-2026")).toBe("AVERYLONGGRO");
  });

  it("always produces a valid id", () => {
    for (const fullName of ["Madina Tulegenova", "Әлия", "x y z", ""]) {
      for (const groupCode of ["204", null, "№5", "ABCDEFGHIJKLMNOP"]) {
        expect(RECEIPT_ID_PATTERN.test(formatReceiptId({ groupCode, number: 42, fullName }))).toBe(true);
      }
    }
  });
});

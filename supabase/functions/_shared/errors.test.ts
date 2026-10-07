import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "./contracts/index.ts";
import { API_ERROR_STATUS, ApiFailure, fromDatabaseError, summarizeIssues } from "./errors.ts";

describe("ApiFailure", () => {
  it("has a status for every contract error code", () => {
    expect(Object.keys(API_ERROR_STATUS).sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it("carries the code's status and an ApiError body", () => {
    const failure = new ApiFailure("conflict", "the session is submitted");
    expect(failure.status).toBe(409);
    expect(failure.toBody()).toEqual({ error: "conflict", message: "the session is submitted" });
    expect(new ApiFailure("forbidden").toBody()).toEqual({ error: "forbidden" });
  });
});

describe("fromDatabaseError", () => {
  it("reads our own codes from the exception message, with details as the message", () => {
    const failure = fromDatabaseError(
      { code: "P0001", message: "conflict", details: "the session is paused", hint: null },
      "issue_command",
    );
    expect(failure.code).toBe("conflict");
    expect(failure.message).toBe("the session is paused");
  });

  it.each([
    [{ code: "42501", message: "forbidden", details: null }, "forbidden", 403],
    [{ code: "P0002", message: "not_found", details: null }, "not_found", 404],
    [{ code: "22023", message: "bad_request", details: "1 to 3 paths" }, "bad_request", 400],
  ] as const)("maps %o to %s", (error, code, status) => {
    const failure = fromDatabaseError(error, "rpc");
    expect(failure.code).toBe(code);
    expect(failure.status).toBe(status);
  });

  it("falls back to the SQLSTATE when the message is Postgres's own", () => {
    expect(
      fromDatabaseError({ code: "22P02", message: "invalid input syntax for type uuid" }, "q").code,
    ).toBe("bad_request");
    expect(
      fromDatabaseError({ code: "42501", message: "permission denied for table events" }, "q").code,
    ).toBe("forbidden");
  });

  it("calls anything else internal", () => {
    expect(fromDatabaseError({ code: "XX000", message: "boom" }, "q").code).toBe("internal");
    expect(fromDatabaseError(new Error("fetch failed"), "q").code).toBe("internal");
    expect(fromDatabaseError("weird", "q").message).toBe("q: weird");
  });
});

describe("summarizeIssues", () => {
  it("joins paths and messages and counts the rest", () => {
    const issues = Array.from({ length: 7 }, (_, i) => ({ path: ["events", i, "type"], message: "Invalid" }));
    expect(summarizeIssues(issues, 2)).toBe("events.0.type: Invalid; events.1.type: Invalid (+5 more)");
    expect(summarizeIssues([{ path: [], message: "Expected object" }])).toBe("Expected object");
  });
});

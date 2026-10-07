import { describe, expect, it } from "vitest";
import { isAlreadyStored, pathsByEvent } from "./stills.ts";

describe("isAlreadyStored", () => {
  it("knows Storage's duplicate answer, as storage-js reports it", () => {
    // The local storage-api answers HTTP 400 with statusCode "409" ("The resource already exists").
    expect(isAlreadyStored({ message: "The resource already exists", status: 400, statusCode: "409" })).toBe(
      true,
    );
    expect(isAlreadyStored({ message: "Duplicate", status: 409 })).toBe(true);
  });

  it("is false for every other failure", () => {
    expect(isAlreadyStored({ message: "Bucket not found", status: 400, statusCode: "404" })).toBe(false);
    expect(isAlreadyStored({ message: "upstream server", status: 502 })).toBe(false);
    expect(isAlreadyStored(new Error("fetch failed"))).toBe(false);
    expect(isAlreadyStored(null)).toBe(false);
    expect(isAlreadyStored("409")).toBe(false);
  });
});

describe("pathsByEvent", () => {
  it("groups the paths of each event in order", () => {
    expect(
      pathsByEvent([
        { eventId: "e1", path: "x/y/e1-0.jpg" },
        { eventId: "e2", path: "x/y/e2-1.jpg" },
        { eventId: "e1", path: "x/y/e1-2.jpg" },
      ]),
    ).toEqual(
      new Map([
        ["e1", ["x/y/e1-0.jpg", "x/y/e1-2.jpg"]],
        ["e2", ["x/y/e2-1.jpg"]],
      ]),
    );
    expect(pathsByEvent([])).toEqual(new Map());
  });
});

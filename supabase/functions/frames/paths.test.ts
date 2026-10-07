import { describe, expect, it } from "vitest";
import { stillPath } from "../_shared/contracts/index.ts";
import { notUploaded, stillFolder, stillPathProblems } from "./paths.ts";

const EXAM = "e0000000-0000-4000-8000-000000000001";
const SESSION = "5e550000-0000-4000-8000-000000000001";
const OTHER_SESSION = "5e550000-0000-4000-8000-000000000002";
const EVENT = "01900000-0000-7000-8000-000000000001";
const OTHER_EVENT = "01900000-0000-7000-8000-000000000002";
const event = { id: EVENT, exam_id: EXAM, session_id: SESSION, frame_count: 2 };

describe("stillPathProblems", () => {
  it("accepts this event's still paths below frame_count", () => {
    expect(
      stillPathProblems([stillPath(EXAM, SESSION, EVENT, 0), stillPath(EXAM, SESSION, EVENT, 1)], event),
    ).toEqual([]);
  });

  it("rejects a path in another session's folder", () => {
    const [problem] = stillPathProblems([stillPath(EXAM, OTHER_SESSION, EVENT, 0)], event);
    expect(problem).toContain("not a still path of this session");
  });

  it("rejects another event's still, an index at frame_count, and anything not shaped like a still", () => {
    expect(stillPathProblems([stillPath(EXAM, SESSION, OTHER_EVENT, 0)], event)[0]).toContain(
      "another event",
    );
    expect(stillPathProblems([stillPath(EXAM, SESSION, EVENT, 2)], event)[0]).toContain(
      "not below frame_count",
    );
    for (const path of [
      `${EXAM}/${SESSION}/../${OTHER_SESSION}/${EVENT}-0.jpg`,
      `${EXAM}/${SESSION}/${EVENT}-0.png`,
      `/${EXAM}/${SESSION}/${EVENT}-0.jpg`,
      `${EXAM.toUpperCase()}/${SESSION}/${EVENT}-0.jpg`,
    ]) {
      expect(stillPathProblems([path], event)).toHaveLength(1);
    }
  });
});

describe("stillFolder and notUploaded", () => {
  it("lists the session folder and finds paths whose object is missing", () => {
    expect(stillFolder(event)).toBe(`${EXAM}/${SESSION}`);
    const paths = [stillPath(EXAM, SESSION, EVENT, 0), stillPath(EXAM, SESSION, EVENT, 1)];
    expect(notUploaded(paths, new Set([`${EVENT}-0.jpg`]))).toEqual([paths[1]]);
    expect(notUploaded(paths, new Set([`${EVENT}-0.jpg`, `${EVENT}-1.jpg`]))).toEqual([]);
  });
});

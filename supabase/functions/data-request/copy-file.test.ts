import { describe, expect, it } from "vitest";
import { DATA_COPY_FORMAT, type DataCopyPackage } from "../_shared/contracts/index.ts";
import { buildCopyFile, objectsToRemove, toBase64 } from "./copy-file.ts";

const SESSION = "019a0000-0000-7000-8000-000000000001";
const FLAG = "019a0000-0000-7000-8000-000000000002";
const FRAME_A = "019a0000-0000-7000-8000-000000000003";
const FRAME_B = "019a0000-0000-7000-8000-000000000004";

function pkg(): DataCopyPackage {
  return {
    format: DATA_COPY_FORMAT,
    generated_at: "2026-10-12T09:00:00+00:00",
    request: { id: "019a0000-0000-7000-8000-000000000009", received_at: "2026-10-09T08:00:00+00:00" },
    workspace: "KRU · Kostanay",
    student: {
      student_number: "20231302",
      full_name: "Zhansaya Omarova",
      email: null,
      group: "204",
      programme: null,
      year: null,
      locale: "kk",
    },
    exams: [],
    flags: [
      {
        id: FLAG,
        session_id: SESSION,
        exam: "Mathematics 2",
        type: "phone.detected",
        source: "app",
        at: "2026-10-09T10:47:10+00:00",
        data: { score: 0.94 },
        frames: [
          { id: FRAME_A, captured_at: "2026-10-09T10:47:10+00:00", storage_path: "e/s/a-0.jpg" },
          { id: FRAME_B, captured_at: "2026-10-09T10:47:11+00:00", storage_path: "e/s/a-1.jpg" },
        ],
      },
    ],
    consent: [],
    devices: [],
  };
}

describe("the copy file (A.5b)", () => {
  it("puts each still's image in place of its storage path", () => {
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const built = buildCopyFile(pkg(), new Map([["e/s/a-0.jpg", image]]));
    const file = JSON.parse(built.json) as { flags: Array<{ frames: Array<Record<string, unknown>> }> };
    expect(file.flags[0]?.frames).toEqual([
      { id: FRAME_A, captured_at: "2026-10-09T10:47:10+00:00", image_jpeg_base64: "/9j/2Q==" },
      { id: FRAME_B, captured_at: "2026-10-09T10:47:11+00:00", image_jpeg_base64: null },
    ]);
    expect(built.json).not.toContain("storage_path");
    expect(built).toMatchObject({ stills: 1, omitted: 1 });
    expect(built.bytes).toBe(new TextEncoder().encode(built.json).length);
  });

  it("leaves out an image that would take the file past the limit, and keeps the still listed", () => {
    const big = new Uint8Array(3000).fill(7);
    const small = new Uint8Array(30).fill(1);
    const empty = buildCopyFile(pkg(), new Map()).bytes;
    const built = buildCopyFile(
      pkg(),
      new Map([
        ["e/s/a-0.jpg", big],
        ["e/s/a-1.jpg", small],
      ]),
      empty + 1000,
    );
    expect(built).toMatchObject({ stills: 1, omitted: 1 });
    expect(built.bytes).toBeLessThanOrEqual(empty + 1000);
    const file = JSON.parse(built.json) as {
      flags: Array<{ frames: Array<{ image_jpeg_base64: unknown }> }>;
    };
    expect(file.flags[0]?.frames.map((frame) => frame.image_jpeg_base64 !== null)).toEqual([false, true]);
  });

  it("encodes base64 like Node, also past one chunk", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("what a delete removes (A.5a)", () => {
  it("joins the frames' paths and the folders' objects, once each", () => {
    const plan = {
      request_id: FLAG,
      student_id: SESSION,
      workspace_id: FRAME_A,
      folders: ["e/s"],
      paths: ["e/s/a-0.jpg"],
    };
    expect(objectsToRemove(plan, ["e/s/a-0.jpg", "e/s/b-0.jpg"])).toEqual(["e/s/a-0.jpg", "e/s/b-0.jpg"]);
    expect(objectsToRemove({ ...plan, paths: [] }, [])).toEqual([]);
  });
});

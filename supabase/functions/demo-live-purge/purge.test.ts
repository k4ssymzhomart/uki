import { describe, expect, it } from "vitest";
import { batches, stillsToRemove } from "./purge.ts";

const exam = "0192a6e0-0000-7000-8000-00000000000e";
const session = "0192a6e0-0000-7000-8000-00000000000a";
const event = "0192a6e0-0000-7000-8000-0000000000e1";
const still = (n: number) => `${exam}/${session}/${event}-${n}.jpg`;

describe("demo-live-purge", () => {
  it("removes only exact still paths, each once", () => {
    expect(
      stillsToRemove([
        { storage_path: still(0) },
        { storage_path: still(1) },
        { storage_path: still(0) },
        { storage_path: `${exam}/${session}/notes.txt` },
        { storage_path: `${exam}/../${session}/${event}-0.jpg` },
        { storage_path: `${exam}/${session}/${event}-3.jpg` },
        { storage_path: exam },
      ]),
    ).toEqual([still(0), still(1)]);
  });

  it("removes in batches of 100", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(batches(items).map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(batches([])).toEqual([]);
    expect(() => batches(items, 0)).toThrow(RangeError);
  });
});

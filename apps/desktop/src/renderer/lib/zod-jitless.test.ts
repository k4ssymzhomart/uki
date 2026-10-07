// @vitest-environment node
// Nothing here imports Zod statically (the ?raw imports are text): the test swaps in a Function that
// refuses, the way the renderer's CSP does, before Zod creates its first schema.
import { describe, expect, it } from "vitest";
import workerSource from "../detection/detection.worker.ts?raw";
import mainSource from "../main.tsx?raw";

/** The specifier of the first import statement in an entry module's source. */
function firstImport(source: string): string | undefined {
  return /^import\s+(?:[^"']*\sfrom\s+)?["']([^"']+)["']/m.exec(source)?.[1];
}

describe("Zod under the renderer's CSP", () => {
  it("goes jitless in every renderer and worker entry before anything creates a schema", () => {
    expect(firstImport(mainSource)).toBe("./lib/zod-jitless.ts");
    expect(firstImport(workerSource)).toBe("../lib/zod-jitless.ts");
  });

  it("never calls new Function: no eval probe and no compiled parsers", async () => {
    const calls: unknown[][] = [];
    const original = globalThis.Function;
    globalThis.Function = new Proxy(original, {
      construct(_target, args: unknown[]) {
        calls.push(args);
        throw new EvalError("Refused to evaluate a string as JavaScript: no 'unsafe-eval'");
      },
    });
    try {
      await import("./zod-jitless.ts");
      const { IngestRequest, JoinExamInput } = await import("@uki/contracts");
      JoinExamInput.safeParse({ code: "MATH2-204-FRI", student_number: "20231187", locale: "kk" });
      IngestRequest.safeParse({ session_id: "0192f3e4-0000-7000-8000-000000000000", events: [] });
      expect(calls).toEqual([]);

      // The control: without jitless, the next z.object() runs the probe this test catches.
      const { z } = await import("zod");
      z.config({ jitless: false });
      z.object({ a: z.string() }).safeParse({ a: "b" });
      expect(calls).toEqual([[""]]);
    } finally {
      globalThis.Function = original;
      const { z } = await import("zod");
      z.config({ jitless: true });
    }
  });
});

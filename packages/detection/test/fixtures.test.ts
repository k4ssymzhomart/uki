// The JSON traces under test/fixtures/ are what test/fixtures/traces.ts builds; regenerate them with
// `pnpm exec tsx test/fixtures/generate.ts` after changing the builder.
import { describe, expect, it } from "vitest";
import { TRACES } from "./fixtures/traces.ts";
import { loadFixture } from "./support/replay.ts";

describe("recorded traces", () => {
  for (const [name, build] of Object.entries(TRACES)) {
    it(`${name}.json is up to date`, () => {
      expect(loadFixture(name)).toEqual(build());
    });
  }
});

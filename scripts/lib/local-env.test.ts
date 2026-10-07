import { describe, expect, it } from "vitest";
import { localValues, mergeEnv } from "./local-env.ts";

const template = `# comment
SUPABASE_URL=http://127.0.0.1:54721
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# SUPABASE_PROJECT_REF=
SEED_STAFF_PASSWORD=
NEXT_TELEMETRY_DISABLED=1
`;

describe("mergeEnv", () => {
  it("replaces owned lines in place, keeps comments and other values, appends missing keys", () => {
    const { text, changed } = mergeEnv(template, {
      SUPABASE_URL: "http://127.0.0.1:54721",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      SEED_STAFF_PASSWORD: "generated",
      VITE_SUPABASE_URL: "http://127.0.0.1:54721",
    });
    expect(text).toBe(`# comment
SUPABASE_URL=http://127.0.0.1:54721
SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc
# SUPABASE_PROJECT_REF=
SEED_STAFF_PASSWORD=generated
NEXT_TELEMETRY_DISABLED=1
VITE_SUPABASE_URL=http://127.0.0.1:54721
`);
    expect(changed).toEqual(["SUPABASE_PUBLISHABLE_KEY", "SEED_STAFF_PASSWORD", "VITE_SUPABASE_URL"]);
  });

  it("changes nothing on a second run", () => {
    const values = { SUPABASE_URL: "http://127.0.0.1:54721", SEED_STAFF_PASSWORD: "x" };
    const first = mergeEnv(template, values).text;
    expect(mergeEnv(first, values)).toEqual({ text: first, changed: [] });
  });
});

describe("localValues", () => {
  it("gives the apps only the publishable key and the scripts the secret key", () => {
    const values = localValues({
      API_URL: "http://127.0.0.1:54721",
      PUBLISHABLE_KEY: "sb_publishable_p",
      SECRET_KEY: "sb_secret_s",
    });
    expect(values.SUPABASE_SECRET_KEY).toBe("sb_secret_s");
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith("NEXT_PUBLIC_") || key.startsWith("VITE_"))
        expect(value).not.toContain("sb_secret_");
    }
  });
});

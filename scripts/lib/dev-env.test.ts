import { describe, expect, it } from "vitest";
import {
  cloudDevEnv,
  DevEnvError,
  isCloudPublicName,
  isSecretName,
  localDevEnv,
  MISSING_CLOUD_ENV,
  pickEnv,
  SECRET_NAMES,
} from "./dev-env.ts";

// Made-up values: each secret is a distinct string, so a leak shows up as that string in the result.
const SECRETS: Record<string, string> = {
  SUPABASE_SECRET_KEY: "sb_secret_cloudsecretkey",
  SUPABASE_SERVICE_ROLE_KEY: "eyJservice.role.legacy",
  SUPABASE_DB_PASSWORD: "db-password-value",
  SUPABASE_ACCESS_TOKEN: "sbp_accesstokenvalue",
  RESEND_API_KEY: "re_resendkeyvalue",
  SEED_STAFF_PASSWORD: "staff-password-value",
  SEED_JUDGE_PASSWORD: "judge-password-value",
  SEED_LMS_URL: "https://lms.example.test/seed-only",
};

const CLOUD_URL = "https://abcdefghijklmnop.supabase.co";
const CLOUD_KEY = "sb_publishable_cloudkey";

const ENV_CLOUD = [
  "# cloud project",
  `SUPABASE_URL=${CLOUD_URL}`,
  `SUPABASE_PUBLISHABLE_KEY="${CLOUD_KEY}"`,
  ...Object.entries(SECRETS).map(([name, value]) => `${name}=${value}`),
  "LOCK_PRIVATE_KEY=lock-private-key-value",
  // A multi-line secret whose body looks like a public line.
  'SUPABASE_EXTRA_SECRET="first line',
  "VITE_SMUGGLED=multi-line-secret-body",
  'last line"',
  "VITE_EXAM_OFFICE_EMAIL=office@kru.test",
].join("\n");

const DOT_ENV = [
  "SUPABASE_URL=http://127.0.0.1:54721",
  "SUPABASE_PUBLISHABLE_KEY=sb_publishable_local",
  "SUPABASE_SECRET_KEY=sb_secret_localsecret",
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54721",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local",
  "VITE_SUPABASE_URL=http://127.0.0.1:54721",
  "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local",
  "VITE_EXAM_OFFICE_EMAIL=exams@kru.test",
  "VITE_LOCK_EXTENSION_ID=enjmmceojibbmnjiplojklhkgmghcchp",
  "LOCK_DEV_PUBLIC_KEY=MIIBIjANBgkq",
  "UKI_ALLOW_CAPTURE=0",
  "SEED_STAFF_PASSWORD=local-staff-password",
].join("\n");

/** A shell that exported every secret, as a careless `source .env.cloud` would. */
const SHELL = { PATH: "/usr/bin", HOME: "/Users/dev", ...SECRETS, GITHUB_TOKEN: "ghp_shelltoken" };

function expectNoSecret(env: Record<string, string>): void {
  for (const name of [...SECRET_NAMES, ...Object.keys(SECRETS), "LOCK_PRIVATE_KEY", "GITHUB_TOKEN"]) {
    expect(env).not.toHaveProperty(name);
  }
  const values = Object.values(env);
  for (const value of [
    ...Object.values(SECRETS),
    "sb_secret_localsecret",
    "local-staff-password",
    "lock-private-key-value",
    "multi-line-secret-body",
    "ghp_shelltoken",
  ]) {
    expect(values).not.toContain(value);
  }
  expect(Object.keys(env).some((name) => name.startsWith("SEED_"))).toBe(false);
}

describe("isSecretName", () => {
  it.each([
    ...SECRET_NAMES,
    "SEED_STAFF_PASSWORD",
    "SEED_JUDGE_PASSWORD",
    "SEED_LMS_URL",
    "LOCK_PRIVATE_KEY",
    "NEXT_PUBLIC_SECRET",
    "VITE_API_KEY",
    "GITHUB_TOKEN",
    "supabase_secret_key",
  ])("%s is secret", (name) => {
    expect(isSecretName(name)).toBe(true);
  });

  it.each([
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "VITE_LOCK_EXTENSION_ID",
    "LOCK_DEV_PUBLIC_KEY",
    "PATH",
  ])("%s is not", (name) => {
    expect(isSecretName(name)).toBe(false);
  });

  it("reads only the address, the publishable key, NEXT_PUBLIC_*, VITE_* and LOCK_* from .env.cloud", () => {
    expect(isCloudPublicName("SUPABASE_URL")).toBe(true);
    expect(isCloudPublicName("LOCK_DEV_PUBLIC_KEY")).toBe(true);
    expect(isCloudPublicName("SUPABASE_PROJECT_REF")).toBe(false);
    expect(isCloudPublicName("UKI_EMAIL_SINK")).toBe(false);
    expect(isCloudPublicName("SUPABASE_SECRET_KEY")).toBe(false);
  });
});

describe("pickEnv", () => {
  it("parses only accepted lines, with quotes, export and comments", () => {
    const text = [
      'export A="one # not a comment"',
      "B=two # comment",
      "C='three'",
      "SECRET=nope",
      "  D = four",
      "not a line",
    ].join("\r\n");
    expect(pickEnv(text, (name) => name !== "SECRET")).toEqual({
      A: "one # not a comment",
      B: "two",
      C: "three",
      D: "four",
    });
  });

  it("skips the body of a multi-line value even when a body line looks like an accepted name", () => {
    const text = 'KEY="-----BEGIN-----\nVITE_X=1\n-----END-----"\nVITE_Y=2';
    expect(pickEnv(text, (name) => name.startsWith("VITE_"))).toEqual({ VITE_Y: "2" });
  });
});

describe("cloudDevEnv", () => {
  it("never hands a secret to the apps, from .env.cloud, .env or the shell", () => {
    expectNoSecret(cloudDevEnv(SHELL, ENV_CLOUD, DOT_ENV));
  });

  it("points every app at the cloud: the six Supabase names, over .env and the shell", () => {
    const env = cloudDevEnv({ ...SHELL, VITE_SUPABASE_URL: "http://127.0.0.1:54721" }, ENV_CLOUD, DOT_ENV);
    expect(env).toMatchObject({
      SUPABASE_URL: CLOUD_URL,
      SUPABASE_PUBLISHABLE_KEY: CLOUD_KEY,
      NEXT_PUBLIC_SUPABASE_URL: CLOUD_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CLOUD_KEY,
      VITE_SUPABASE_URL: CLOUD_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: CLOUD_KEY,
    });
  });

  it("keeps the other build values: shell, then .env.cloud, then .env", () => {
    const env = cloudDevEnv({ ...SHELL, UKI_ALLOW_CAPTURE: "1" }, ENV_CLOUD, DOT_ENV);
    expect(env.VITE_EXAM_OFFICE_EMAIL).toBe("office@kru.test");
    expect(env.VITE_LOCK_EXTENSION_ID).toBe("enjmmceojibbmnjiplojklhkgmghcchp");
    expect(env.LOCK_DEV_PUBLIC_KEY).toBe("MIIBIjANBgkq");
    expect(env.UKI_ALLOW_CAPTURE).toBe("1");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("works with .env.cloud alone", () => {
    const env = cloudDevEnv({}, `SUPABASE_URL=${CLOUD_URL}\nSUPABASE_PUBLISHABLE_KEY=${CLOUD_KEY}\n`, null);
    expect(env.VITE_SUPABASE_URL).toBe(CLOUD_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(CLOUD_KEY);
  });

  function problems(cloudText: string, dotEnv: string | null = null): string[] {
    try {
      cloudDevEnv({}, cloudText, dotEnv);
    } catch (error) {
      expect(error).toBeInstanceOf(DevEnvError);
      return [...(error as DevEnvError).problems];
    }
    throw new Error("expected a DevEnvError");
  }

  it("names what is missing", () => {
    expect(problems("SUPABASE_SECRET_KEY=sb_secret_x\nSUPABASE_URL=\n")).toEqual([
      "SUPABASE_URL is missing from .env.cloud",
      "SUPABASE_PUBLISHABLE_KEY is missing from .env.cloud",
    ]);
  });

  it("refuses a secret key where the publishable key belongs, without echoing it", () => {
    const leaked = "sb_secret_pastedbymistake";
    const found = problems(
      `SUPABASE_URL=${CLOUD_URL}\nSUPABASE_PUBLISHABLE_KEY=${leaked}\nVITE_KEY=${leaked}\n`,
    );
    expect(found.join("\n")).toMatch(/SUPABASE_PUBLISHABLE_KEY in \.env\.cloud holds a secret key/);
    expect(found.join("\n")).toMatch(/VITE_KEY in \.env\.cloud holds a secret key/);
    expect(found.join("\n")).not.toContain(leaked);
  });

  it("refuses a local or plain-http address: that is pnpm dev:local", () => {
    for (const url of ["http://127.0.0.1:54721", "https://localhost:54721", "http://abcd.supabase.co"]) {
      const found = problems(`SUPABASE_URL=${url}\nSUPABASE_PUBLISHABLE_KEY=${CLOUD_KEY}\n`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^SUPABASE_URL in \.env\.cloud must be the cloud project's address/);
      expect(found[0]).not.toContain(url);
    }
  });

  it("refuses a secret key in .env's public lines too", () => {
    const found = problems(
      `SUPABASE_URL=${CLOUD_URL}\nSUPABASE_PUBLISHABLE_KEY=${CLOUD_KEY}\n`,
      "VITE_LOCK_EXTENSION_ID=sb_secret_wrongline\n",
    );
    expect(found).toEqual([
      "VITE_LOCK_EXTENSION_ID in .env holds a secret key (sb_secret_…); the apps take only public values",
    ]);
  });

  it("explains how to create a missing .env.cloud, with placeholders only", () => {
    expect(MISSING_CLOUD_ENV).toContain("SUPABASE_URL=https://<project-ref>.supabase.co");
    expect(MISSING_CLOUD_ENV).toContain("SUPABASE_PUBLISHABLE_KEY=sb_publishable_...");
    expect(MISSING_CLOUD_ENV).toContain("pnpm dev:local");
  });
});

describe("localDevEnv", () => {
  it("passes .env's public build values, the shell first, and no secret", () => {
    const env = localDevEnv({ ...SHELL, VITE_EXAM_OFFICE_EMAIL: "shell@kru.test" }, DOT_ENV);
    expectNoSecret(env);
    expect(env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54721");
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_local");
    expect(env.VITE_EXAM_OFFICE_EMAIL).toBe("shell@kru.test");
    // As before: the apps get the NEXT_PUBLIC_ and VITE_ copies, not SUPABASE_URL itself.
    expect(env).not.toHaveProperty("SUPABASE_URL");
  });

  it("works without .env", () => {
    expect(localDevEnv({ PATH: "/usr/bin" }, null)).toEqual({ PATH: "/usr/bin" });
  });
});

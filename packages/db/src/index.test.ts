import { describe, expect, it } from "vitest";
import { assertSecretKey, createUkiAdminClient } from "./admin.ts";
import { Constants, createUkiClient, SupabaseKeyError } from "./index.ts";

const URL = "http://127.0.0.1:54721";

describe("createUkiClient", () => {
  it("accepts a publishable key", () => {
    const client = createUkiClient(URL, "sb_publishable_test", { auth: { persistSession: false } });
    expect(typeof client.rpc).toBe("function");
  });

  it("refuses a secret key", () => {
    expect(() => createUkiClient(URL, "sb_secret_test")).toThrow(SupabaseKeyError);
  });

  it("refuses a legacy JWT key", () => {
    expect(() => createUkiClient(URL, "eyJhbGciOiJIUzI1NiJ9.e30.x")).toThrow(SupabaseKeyError);
  });
});

describe("createUkiAdminClient", () => {
  it("accepts only a secret key", () => {
    expect(() => assertSecretKey("sb_secret_test")).not.toThrow();
    expect(() => createUkiAdminClient(URL, "sb_publishable_test")).toThrow(SupabaseKeyError);
    expect(() => createUkiAdminClient(URL, "eyJhbGciOiJIUzI1NiJ9.e30.x")).toThrow(SupabaseKeyError);
  });
});

describe("generated enums", () => {
  it("mirror the Session states table", () => {
    expect(Constants.public.Enums.session_state).toEqual([
      "joined",
      "checking",
      "identity",
      "rules",
      "ready",
      "writing",
      "paused",
      "submitted",
      "time_up",
      "ended",
    ]);
  });

  it("carry every command type", () => {
    expect(Constants.public.Enums.command_type).toEqual([
      "pause",
      "resume",
      "end",
      "message",
      "add_time",
      "start",
    ]);
  });
});

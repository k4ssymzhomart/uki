import { describe, expect, it } from "vitest";
import { ApiError, errorCode, pathOnly, SupabaseApi } from "../src/api.ts";

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("api", () => {
  it("reads the error code of PostgREST, Edge Function and Auth bodies", () => {
    expect(errorCode({ code: "P0001", message: "already_joined", details: null, hint: null })).toBe(
      "already_joined",
    );
    expect(errorCode({ code: "42501", message: "forbidden", details: "read_only", hint: null })).toBe(
      "forbidden",
    );
    expect(errorCode({ error: "rate_limited", message: "too fast" })).toBe("rate_limited");
    expect(
      errorCode({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }),
    ).toBe("refresh_token_not_found");
    expect(errorCode("Bad Gateway")).toBeNull();
  });

  it("never runs with a secret key", () => {
    expect(
      () => new SupabaseApi({ url: "https://x.supabase.co", publishableKey: "sb_secret_abc" }),
    ).toThrow();
  });

  it("sends the publishable key, the student's token, and turns join_exam's errors into ApiError", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const api = new SupabaseApi({
      url: "https://x.supabase.co/",
      publishableKey: "sb_publishable_test",
      fetch: async (url, init) => {
        seen.push({ url, headers: init.headers as Record<string, string> });
        return reply(409, { code: "P0001", message: "already_joined", details: null, hint: null });
      },
    });
    const error = await api
      .joinExam({ code: "DEMO-LIVE", student_number: "20249001", locale: "kk", device: {} }, "token-1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("already_joined");
    expect((error as ApiError).status).toBe(409);
    expect(seen[0]?.url).toBe("https://x.supabase.co/rest/v1/rpc/join_exam");
    expect(seen[0]?.headers).toMatchObject({
      apikey: "sb_publishable_test",
      authorization: "Bearer token-1",
    });
  });

  it("calls a network failure transient, without the URL's token", async () => {
    const api = new SupabaseApi({
      url: "https://x.supabase.co",
      publishableKey: "sb_publishable_test",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const error = (await api
      .upload(
        "https://x.supabase.co/storage/v1/object/upload/sign/frames/a/b/c-0.jpg?token=secret",
        new Uint8Array(1),
        "t",
      )
      .catch((e: unknown) => e)) as ApiError;
    expect(error.transient).toBe(true);
    expect(error.message).not.toContain("secret");
    expect(pathOnly("https://x.supabase.co/storage/v1/object/upload/sign/frames/a.jpg?token=abc")).toBe(
      "/storage/v1/object/upload/sign/frames/…",
    );
  });

  it("stores the anonymous sign-in with its expiry", async () => {
    const api = new SupabaseApi({
      url: "https://x.supabase.co",
      publishableKey: "sb_publishable_test",
      fetch: async (url, init) => {
        expect(url).toBe("https://x.supabase.co/auth/v1/signup");
        expect((init.headers as Record<string, string>).authorization).toBeUndefined();
        return reply(200, { access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u" } });
      },
    });
    expect(await api.signInAnonymously(1_000_000)).toEqual({
      user_id: "u",
      access_token: "a",
      refresh_token: "r",
      expires_at: 1000 + 3600,
    });
  });
});

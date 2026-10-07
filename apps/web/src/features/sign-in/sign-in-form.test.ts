import { describe, expect, it } from "vitest";
import { parseSignInForm, signInErrorFromAuth } from "./sign-in-form.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("parseSignInForm", () => {
  it("accepts an email and a password, with the 12-hour box checked or not", () => {
    expect(parseSignInForm(form({ email: " dana.akhmetova@kru.test ", password: "pw", keep: "on" }))).toEqual(
      {
        ok: true,
        data: { email: "dana.akhmetova@kru.test", password: "pw", keep: true },
      },
    );
    const unchecked = parseSignInForm(form({ email: "dana.akhmetova@kru.test", password: "pw" }));
    expect(unchecked.ok && unchecked.data.keep).toBe(false);
  });

  it("puts an error under each bad field and keeps the email and the box", () => {
    expect(parseSignInForm(form({ email: "dana", password: "" }))).toEqual({
      ok: false,
      state: { email: "dana", keep: false, errors: { email: "email", password: "password" } },
    });
    expect(parseSignInForm(form({ email: "dana.akhmetova@kru.test", password: "", keep: "on" }))).toEqual({
      ok: false,
      state: { email: "dana.akhmetova@kru.test", keep: true, errors: { password: "password" } },
    });
  });
});

describe("signInErrorFromAuth", () => {
  it("maps Supabase Auth errors to the messages under the fields", () => {
    expect(signInErrorFromAuth({ code: "invalid_credentials", status: 400 })).toBe("credentials");
    expect(signInErrorFromAuth({ code: "over_request_rate_limit", status: 429 })).toBe("rateLimited");
    expect(signInErrorFromAuth({ status: 429 })).toBe("rateLimited");
    expect(signInErrorFromAuth({ status: 500 })).toBe("unavailable");
    expect(signInErrorFromAuth({})).toBe("unavailable");
  });
});

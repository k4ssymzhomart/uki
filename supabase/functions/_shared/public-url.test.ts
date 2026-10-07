import { describe, expect, it } from "vitest";
import { forwardedOrigin, publicOrigin, toPublicUrl } from "./public-url.ts";

const LOCAL_GATEWAY = new Headers({
  "x-forwarded-host": "127.0.0.1",
  "x-forwarded-port": "54721",
  "x-forwarded-proto": "http",
});

describe("forwardedOrigin", () => {
  it("rebuilds the Supabase CLI's public origin from Kong's headers", () => {
    expect(forwardedOrigin(LOCAL_GATEWAY)).toBe("http://127.0.0.1:54721");
  });

  it("keeps a port already in the host and drops default ports", () => {
    expect(
      forwardedOrigin(new Headers({ "x-forwarded-host": "localhost:8000", "x-forwarded-port": "1" })),
    ).toBe("http://localhost:8000");
    expect(
      forwardedOrigin(
        new Headers({
          "x-forwarded-host": "a.test",
          "x-forwarded-port": "443",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://a.test");
    expect(forwardedOrigin(new Headers({ "x-forwarded-host": "[::1]", "x-forwarded-port": "54721" }))).toBe(
      "http://[::1]:54721",
    );
  });

  it("returns null without a host or with an odd protocol", () => {
    expect(forwardedOrigin(new Headers())).toBeNull();
    expect(forwardedOrigin(new Headers({ "x-forwarded-host": "a", "x-forwarded-proto": "ftp" }))).toBeNull();
  });
});

describe("publicOrigin", () => {
  it("keeps an https project URL whatever the headers say", () => {
    const forged = new Headers({ "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
    expect(publicOrigin("https://abc.supabase.co", forged)).toBe("https://abc.supabase.co");
  });

  it("uses the forwarded origin for the CLI's internal gateway", () => {
    expect(publicOrigin("http://kong:8000", LOCAL_GATEWAY)).toBe("http://127.0.0.1:54721");
    expect(publicOrigin("http://kong:8000", new Headers())).toBe("http://kong:8000");
  });
});

describe("toPublicUrl", () => {
  it("moves a URL signed on the internal gateway to the public origin, keeping path and token", () => {
    const signed = "http://kong:8000/storage/v1/object/upload/sign/frames/a/b/c-0.jpg?token=xyz";
    expect(toPublicUrl(signed, "http://kong:8000", "http://127.0.0.1:54721")).toBe(
      "http://127.0.0.1:54721/storage/v1/object/upload/sign/frames/a/b/c-0.jpg?token=xyz",
    );
  });

  it("leaves URLs from any other origin alone", () => {
    const signed = "https://abc.supabase.co/storage/v1/object/sign/frames/x.jpg?token=t";
    expect(toPublicUrl(signed, "https://abc.supabase.co", "https://abc.supabase.co")).toBe(signed);
    expect(toPublicUrl(signed, "http://kong:8000", "http://127.0.0.1:54721")).toBe(signed);
  });
});

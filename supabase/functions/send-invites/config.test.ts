// send-invites' environment: the one required key, the defaults, and the sink.
import { describe, expect, it } from "vitest";
import { ApiFailure } from "../_shared/errors.ts";
import { DEFAULT_DOWNLOAD_URL, DEFAULT_FROM, deliveryAddress, readInviteConfig } from "./config.ts";
import { RESEND_API } from "./resend.ts";

const env = (vars: Record<string, string>) => (name: string) => vars[name];

describe("readInviteConfig", () => {
  it("needs RESEND_API_KEY and sends nothing without it", () => {
    expect(() => readInviteConfig(env({}))).toThrow(ApiFailure);
    expect(() => readInviteConfig(env({ RESEND_API_KEY: "  " }))).toThrow("RESEND_API_KEY is not set");
  });

  it("defaults to Resend, its test sender, no sink, no images and the releases page", () => {
    expect(readInviteConfig(env({ RESEND_API_KEY: "k" }))).toEqual({
      apiKey: "k",
      baseUrl: RESEND_API,
      from: DEFAULT_FROM,
      sink: null,
      assetsUrl: null,
      downloadUrl: DEFAULT_DOWNLOAD_URL,
    });
  });

  it("reads every setting", () => {
    const config = readInviteConfig(
      env({
        RESEND_API_KEY: "k",
        RESEND_BASE_URL: "http://host.docker.internal:25790",
        UKI_EMAIL_FROM: "KRU <exams@kru.test>",
        UKI_EMAIL_SINK: " Me@Example.com ",
        UKI_WEB_URL: "https://uki-web.vercel.app/",
        UKI_DOWNLOAD_URL: "https://uki-web.vercel.app/download",
      }),
    );
    expect(config).toEqual({
      apiKey: "k",
      baseUrl: "http://host.docker.internal:25790",
      from: "KRU <exams@kru.test>",
      sink: "me@example.com",
      assetsUrl: "https://uki-web.vercel.app/email",
      downloadUrl: "https://uki-web.vercel.app/download",
    });
  });

  it("refuses a setting that is not an address", () => {
    expect(() => readInviteConfig(env({ RESEND_API_KEY: "k", UKI_EMAIL_SINK: "nobody" }))).toThrow(
      "UKI_EMAIL_SINK is not valid",
    );
    expect(() => readInviteConfig(env({ RESEND_API_KEY: "k", UKI_WEB_URL: "ftp://x" }))).toThrow(
      "UKI_WEB_URL is not valid",
    );
  });
});

describe("deliveryAddress", () => {
  it("sends to the sink when it is set, else to the recipient", () => {
    expect(deliveryAddress({ sink: "me@example.com" }, "madina@kru.test")).toBe("me@example.com");
    expect(deliveryAddress({ sink: null }, "madina@kru.test")).toBe("madina@kru.test");
  });
});

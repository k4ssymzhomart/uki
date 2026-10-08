import { describe, expect, it } from "vitest";
import { signInQuery } from "../sign-in/sign-in-query.ts";
import {
  DEMO_LIVE_CODE,
  DEMO_LIVE_PATH,
  DEMO_LIVE_SIGN_IN,
  DEMO_TRIES,
  demoVideo,
  JUDGE_EMAIL,
  LIVE_DEMO_HREF,
  liveWallPath,
  signInHref,
} from "./demo-model.ts";

describe("the judge path's addresses", () => {
  it("keeps the judge mode constants", () => {
    expect(DEMO_LIVE_CODE).toBe("DEMO-LIVE");
    expect(JUDGE_EMAIL).toBe("judge@kru.test");
    expect(DEMO_LIVE_PATH).toBe("/demo/live");
  });

  it("links Live demo to sign-in with the judge's email, then /demo/live, as the user gave it", () => {
    expect(LIVE_DEMO_HREF).toBe("/sign-in?email=judge%40kru.test&next=/demo/live");
    const query = new URL(LIVE_DEMO_HREF, "https://uki.invalid").searchParams;
    expect(signInQuery(Object.fromEntries(query))).toEqual({ email: JUDGE_EMAIL, next: DEMO_LIVE_PATH });
  });

  it("sends a visitor from /demo/live to sign-in, which comes back", () => {
    expect(DEMO_LIVE_SIGN_IN).toBe("/sign-in?next=/demo/live");
    expect(signInHref("a+b@kru.test", "/overview")).toBe("/sign-in?email=a%2Bb%40kru.test&next=/overview");
  });

  it("opens an exam's live wall", () => {
    expect(liveWallPath("0199b6a4-6c1e-7b3a-9f2d-3c4b5a690001")).toBe(
      "/exams/0199b6a4-6c1e-7b3a-9f2d-3c4b5a690001/live",
    );
  });

  it("lists the three things to try in the user's order", () => {
    expect(DEMO_TRIES.map((item) => item.id)).toEqual(["flags", "ask", "report"]);
  });
});

describe("demoVideo", () => {
  it("is a placeholder until NEXT_PUBLIC_DEMO_VIDEO_URL is an https address", () => {
    expect(demoVideo(undefined)).toEqual({ kind: "none" });
    expect(demoVideo("")).toEqual({ kind: "none" });
    expect(demoVideo("  ")).toEqual({ kind: "none" });
    expect(demoVideo("not a url")).toEqual({ kind: "none" });
    expect(demoVideo("http://example.com/demo.mp4")).toEqual({ kind: "none" });
    expect(demoVideo("javascript:alert(1)")).toEqual({ kind: "none" });
  });

  it("links the video once it is set", () => {
    expect(demoVideo("https://example.com/uki-demo.mp4")).toEqual({
      kind: "link",
      url: "https://example.com/uki-demo.mp4",
    });
    expect(demoVideo(" https://youtu.be/abc ")).toEqual({ kind: "link", url: "https://youtu.be/abc" });
  });
});

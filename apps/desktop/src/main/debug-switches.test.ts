// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findDebugSwitch } from "./debug-switches.ts";

const none = { hasSwitch: () => false };

describe("findDebugSwitch", () => {
  it("finds remote debugging and inspector switches", () => {
    expect(findDebugSwitch({ hasSwitch: (name) => name === "remote-debugging-port" }, [])).toBe(
      "remote-debugging-port",
    );
    expect(findDebugSwitch(none, ["/Applications/Üki.app/Contents/MacOS/Üki", "--inspect=9229"])).toBe(
      "inspect",
    );
    expect(findDebugSwitch(none, ["Üki.exe", "--remote-debugging-pipe"])).toBe("remote-debugging-pipe");
  });

  it("finds the fake camera switches", () => {
    expect(findDebugSwitch(none, ["Uki", "--use-file-for-fake-video-capture=/tmp/me.y4m"])).toBe(
      "use-file-for-fake-video-capture",
    );
    expect(
      findDebugSwitch({ hasSwitch: (name) => name === "use-fake-device-for-media-stream" }, ["Uki"]),
    ).toBe("use-fake-device-for-media-stream");
  });

  it("lets a plain start through", () => {
    expect(findDebugSwitch(none, ["/Applications/Üki.app/Contents/MacOS/Üki", "--lang=kk"])).toBeNull();
    expect(findDebugSwitch(none, ["Üki.exe", "--inspector-is-not-a-switch"])).toBeNull();
  });
});

// The worker's network guard: model files on the models' origin pass, tasks-vision's usage logs to
// Google do not, in the browser (https) and in the desktop app (uki://app).
import { describe, expect, it, vi } from "vitest";
import { originKey, restrictNetwork } from "../src/network-guard.ts";

const ODML = "https://odml.pa.googleapis.com/v1/log";

function scope(href: string) {
  const fetch = vi.fn(async (_input: unknown, _init?: unknown): Promise<unknown> => "response");
  const open = vi.fn();
  class FakeXhr {}
  (FakeXhr.prototype as unknown as { open: unknown }).open = open;
  return {
    fetch,
    open,
    target: {
      fetch,
      XMLHttpRequest: FakeXhr as unknown as { prototype: { open: (m: string, u: string | URL) => void } },
      location: { href },
    },
  };
}

describe("restrictNetwork", () => {
  it("lets the browser demo fetch its models and refuses the usage logs", async () => {
    const s = scope("https://uki.test/_next/static/chunks/worker.js");
    const refused = restrictNetwork(
      ["https://uki.test/models/wasm", "https://uki.test/models/face_landmarker.task"],
      s.target,
    );
    await expect(s.target.fetch("https://uki.test/models/face_landmarker.task")).resolves.toBe("response");
    await expect(s.target.fetch("/models/wasm/vision_wasm_internal.wasm")).resolves.toBe("response");
    await expect(s.target.fetch({ url: "https://uki.test/models/x.tflite" })).resolves.toBe("response");
    await expect(s.target.fetch("data:application/octet-stream;base64,AA==")).resolves.toBe("response");
    await expect(s.target.fetch(ODML, { method: "POST" })).rejects.toThrow(TypeError);
    await expect(s.target.fetch("https://project.supabase.co/rest/v1/events")).rejects.toThrow(TypeError);
    expect(s.fetch).toHaveBeenCalledTimes(4);
    expect(refused).toEqual([ODML, "https://project.supabase.co/rest/v1/events"]);

    const xhr = s.target.XMLHttpRequest?.prototype;
    xhr?.open("GET", "https://uki.test/models/face_landmarker.task");
    expect(s.open).toHaveBeenCalledOnce();
    expect(() => xhr?.open("POST", ODML)).toThrow(TypeError);
    expect(s.open).toHaveBeenCalledOnce();
  });

  it("works for the desktop app's uki://app scheme", async () => {
    const s = scope("uki://app/renderer/assets/detection.worker.js");
    restrictNetwork(["uki://app/resources/models/wasm"], s.target);
    await expect(s.target.fetch("uki://app/resources/models/efficientdet_lite0.tflite")).resolves.toBe(
      "response",
    );
    await expect(s.target.fetch(ODML)).rejects.toThrow(TypeError);
    expect(originKey("uki://app/resources/models/x")).toBe("uki://app");
    expect(originKey("not a url")).toBeNull();
  });
});

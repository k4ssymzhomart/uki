// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { guardQuit, type QuitEvents } from "./quit-guard.ts";

describe("guardQuit", () => {
  it("cancels before-quit while the exam holds the app", () => {
    const app = new EventEmitter();
    let held = false;
    guardQuit(app as unknown as QuitEvents, () => held);
    const quit = () => {
      const event = { preventDefault: vi.fn() };
      app.emit("before-quit", event);
      return event.preventDefault.mock.calls.length === 0;
    };
    expect(quit()).toBe(true);
    held = true;
    expect(quit()).toBe(false);
    expect(quit()).toBe(false);
    held = false;
    expect(quit()).toBe(true);
  });
});

import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadMessages } from "@uki/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app.tsx";
import { FlowRuntime } from "./flow/runtime.ts";
import type { Outbox } from "./outbox/outbox.ts";
import { FakeBridge, FakeDetection, FakeIdentity, FakeStudentApi } from "./test/fakes.ts";
import { EXAM_ID, flushIo, freshOutbox } from "./test/harness.ts";

// IndexedDB work runs on real macrotasks; a loaded CI machine needs time.
vi.setConfig({ testTimeout: 30_000 });

let bridge: FakeBridge;
let outbox: Outbox;
let runtime: FlowRuntime;

beforeEach(() => {
  bridge = new FakeBridge();
  Object.defineProperty(window, "uki", { configurable: true, value: bridge });
  outbox = freshOutbox();
  runtime = new FlowRuntime({
    bridge,
    api: new FakeStudentApi({ examId: EXAM_ID, now: () => Date.now() }),
    ensureSignedIn: async () => {},
    outbox,
    locale: "kk",
    contactEmail: null,
    createDetection: (options) => new FakeDetection(options),
    createIdentity: (options) => new FakeIdentity(options),
  });
  runtime.start();
});

afterEach(async () => {
  cleanup();
  runtime.stop();
  await outbox.db.delete();
  window.location.hash = "";
});

async function renderApp() {
  render(<App runtime={runtime} />);
  await act(async () => {
    await flushIo(30);
  });
}

describe("the student window", () => {
  it("opens on 1.1 in Kazakh and switches to Russian and English from the title bar", async () => {
    await renderApp();
    const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
    expect(document.querySelector("[data-frame]")?.getAttribute("data-frame")).toBe("1.1");
    expect(heading()).toBe(loadMessages("kk").join.title);
    expect(document.documentElement.lang).toBe("kk-KZ");

    fireEvent.click(screen.getByText("РУС"));
    await waitFor(() => expect(heading()).toBe(loadMessages("ru").join.title));
    expect(document.documentElement.lang).toBe("ru-RU");
    expect(runtime.actor.getSnapshot().context.locale).toBe("ru");

    fireEvent.click(screen.getByText("ENG"));
    await waitFor(() => expect(heading()).toBe(loadMessages("en").join.title));
    fireEvent.click(screen.getByText("ҚАЗ"));
    await waitFor(() => expect(heading()).toBe(loadMessages("kk").join.title));
  });

  it("shows the pairing card while Üki Lock waits for its code (E.3)", async () => {
    await renderApp();
    expect(document.querySelector("[data-pairing-card]")).toBeNull();
    await act(async () => {
      bridge.pairCode({ code: "482913", expires_at: new Date(Date.now() + 120_000).toISOString() });
      await flushIo(5);
    });
    const card = screen.getByRole("dialog", { name: loadMessages("kk").pair.card.title });
    expect(card.textContent).toContain("482 913");
    expect(card.textContent).toContain(loadMessages("kk").pair.card.body);
    await act(async () => {
      bridge.pairCode(null);
      await flushIo(5);
    });
    expect(document.querySelector("[data-pairing-card]")).toBeNull();
  });
});

describe("development routes", () => {
  it("serves the screens gallery at #/screens", async () => {
    window.location.hash = "#/screens?frame=2.1&locale=en&bare=1";
    render(<App runtime={runtime} />);
    await waitFor(() => expect(document.querySelector('[data-frame="2.1"]')).not.toBeNull(), {
      timeout: 15_000,
    });
  });
});

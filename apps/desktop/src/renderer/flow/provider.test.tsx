import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocale } from "../i18n/locale-context.ts";
import { UkiIntlProvider } from "../i18n/uki-intl-provider.tsx";
import type { Outbox } from "../outbox/outbox.ts";
import { FakeBridge, FakeDetection, FakeIdentity, FakeStudentApi } from "../test/fakes.ts";
import { EXAM_ID, flushIo, freshOutbox } from "../test/harness.ts";
import { FlowProvider, useStudentFlow } from "./provider.tsx";
import { FlowRuntime } from "./runtime.ts";

// IndexedDB work runs on real macrotasks between fake-clock steps; a loaded CI machine needs time.
vi.setConfig({ testTimeout: 30_000 });

let outbox: Outbox;
let runtime: FlowRuntime;

function Probe() {
  const { state, send } = useStudentFlow();
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <output data-testid="frame">{state.frame}</output>
      <output data-testid="flow-locale">{state.locale}</output>
      <output data-testid="intl-locale">{locale}</output>
      <button type="button" onClick={() => send({ type: "SET_LOCALE", locale: "ru" })}>
        flow
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        intl
      </button>
    </div>
  );
}

beforeEach(() => {
  outbox = freshOutbox();
  runtime = new FlowRuntime({
    bridge: new FakeBridge(),
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
  runtime.stop();
  await outbox.db.delete();
});

describe("FlowProvider", () => {
  it("hands the screens a model and keeps the language in step both ways", async () => {
    render(
      <UkiIntlProvider initialLocale="en">
        <FlowProvider runtime={runtime}>
          <Probe />
        </FlowProvider>
      </UkiIntlProvider>,
    );
    await act(async () => {
      await flushIo(20);
    });
    expect(screen.getByTestId("frame").textContent).toBe("1.1");
    // The flow's language (kk, kept on the laptop) wins on mount.
    expect(screen.getByTestId("intl-locale").textContent).toBe("kk");
    await act(async () => {
      screen.getByText("flow").click();
    });
    expect(screen.getByTestId("intl-locale").textContent).toBe("ru");
    await act(async () => {
      screen.getByText("intl").click();
    });
    expect(screen.getByTestId("flow-locale").textContent).toBe("en");
    expect(screen.getByTestId("intl-locale").textContent).toBe("en");
  });
});

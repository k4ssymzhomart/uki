import { cleanup, render } from "@testing-library/react";
import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowUiEvent, Frame, ScreenModel } from "../../flow/view-model.ts";
import { fixture } from "../fixtures.ts";
import { StudentScreen } from "../student-screen.tsx";

afterEach(cleanup);

/** The frame's fixture with the proctor's full name, as session_commands.by_name carries it. */
function withFullName(frame: Frame): ScreenModel {
  const model = fixture(frame, "en");
  return JSON.parse(JSON.stringify(model).replaceAll('"Aigerim S."', '"Aigerim Sadykova"')) as ScreenModel;
}

function renderFrame(frame: Frame) {
  const send = vi.fn<(event: FlowUiEvent) => void>();
  return render(
    <IntlProvider locale={BCP47.en} messages={loadMessages("en")} timeZone={TIME_ZONE} formats={formats}>
      <StudentScreen model={withFullName(frame)} send={send} os="macos" />
    </IntlProvider>,
  );
}

describe("the proctor's short name (Figma 2.1c, 2.1d and 2.1e)", () => {
  it.each(["2.1c", "2.1d", "2.1e"] as const)("%s names the proctor by first name and initial", (frame) => {
    const model = withFullName(frame);
    expect(JSON.stringify(model)).toContain("Aigerim Sadykova");
    const { container } = renderFrame(frame);
    const text = container.textContent ?? "";
    expect(text).toContain("Aigerim S.");
    expect(text).not.toContain("Sadykova");
  });
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { WorkspaceSettings } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "../../../test/render.tsx";
import { SETTINGS, WORKSPACE } from "../students/test-fixtures.ts";
import type { SaveSettingsResult } from "./settings-actions.ts";
import { SettingsView } from "./settings-view.tsx";

vi.mock("./settings-actions.ts", () => ({ saveWorkspaceSettings: vi.fn() }));

type Save = (input: { workspaceId: string; settings: WorkspaceSettings }) => Promise<SaveSettingsResult>;

function renderSettings(save: Save) {
  return renderWithIntl(<SettingsView workspaceId={WORKSPACE} settings={SETTINGS} save={save} />, DANA);
}

const toggle = (name: string) => screen.getByRole("switch", { name }) as HTMLButtonElement;

describe("A.4 Settings", () => {
  it("draws the defaults and the checks, with the fixed rows not switchable", () => {
    renderSettings(vi.fn());
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Admin / Settings");
    expect(text).toContain("Every new exam starts with these. Each exam can change them.");
    for (const value of ["Қазақша", "2 seconds", "0.55", "90 days", "90 min", "20 min before the start"]) {
      expect(text).toContain(value);
    }
    expect(toggle("Browser lock").getAttribute("aria-checked")).toBe("true");
    expect(toggle("Browser lock").disabled).toBe(false);
    expect(toggle("Identity check").disabled).toBe(false);
    for (const fixed of ["Gaze control", "Phone detection", "Second person"]) {
      expect(toggle(fixed).getAttribute("aria-checked")).toBe("true");
      expect(toggle(fixed).disabled).toBe(true);
    }
    expect((screen.getByRole("combobox", { name: "Rules language" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // A.4a to A.4d are Phase 3.
    expect(text).not.toContain("Integrations");
    expect(text).not.toContain("Invite a proctor");
    expect(intlErrors).toEqual([]);
    expect(rawKeys(document.body)).toEqual([]);
  });

  it("saves a switched check at once with the whole settings object", async () => {
    const save = vi.fn<Save>(async ({ settings }) => ({ ok: true, settings }));
    renderSettings(save);
    fireEvent.click(toggle("Identity check"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      settings: { ...SETTINGS, default_checks: { ...SETTINGS.default_checks, identity: false } },
    });
    expect(await screen.findByText("Settings saved. The next new exam starts with them.")).toBeTruthy();
    expect(toggle("Identity check").getAttribute("aria-checked")).toBe("false");
  });

  it("puts the switch back and says so when the save fails", async () => {
    const save = vi.fn<Save>(async () => ({ ok: false, error: "forbidden" }));
    renderSettings(save);
    fireEvent.click(toggle("Browser lock"));
    expect(await screen.findByText("Only the exam office can change these settings.")).toBeTruthy();
    await waitFor(() => expect(toggle("Browser lock").getAttribute("aria-checked")).toBe("true"));
  });

  it("treats a thrown save as a failed one", async () => {
    const save = vi.fn<Save>(async () => {
      throw new Error("network");
    });
    renderSettings(save);
    fireEvent.click(toggle("Identity check"));
    expect(await screen.findByText("The settings were not saved. Try again.")).toBeTruthy();
    await waitFor(() => expect(toggle("Identity check").getAttribute("aria-checked")).toBe("true"));
  });
});

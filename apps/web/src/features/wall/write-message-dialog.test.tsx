import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CommandRequest } from "@uki/contracts";
import { ToastProvider } from "@uki/ui";
import { describe, expect, it, vi } from "vitest";
import type { CallErrorCode, FunctionsClient } from "./functions-client.ts";
import type { MessageTarget } from "./message-target.ts";
import { EXAM_ID, renderIntl, sessionId, setupDom } from "./test-helpers.tsx";
import { FunctionsClientContext } from "./use-command.ts";
import { WriteMessageDialog } from "./write-message-dialog.tsx";

setupDom();

function setup(
  failWith?: CallErrorCode,
  target: MessageTarget = { scope: "group", examId: EXAM_ID, label: "Group 204" },
) {
  const sent: CommandRequest[] = [];
  const api: FunctionsClient = {
    command: vi.fn(async (request: CommandRequest) => {
      sent.push(request);
      return failWith
        ? { ok: false as const, code: failWith }
        : { ok: true as const, data: { command_ids: [] } };
    }),
    stills: vi.fn(),
  };
  const onOpenChange = vi.fn();
  renderIntl(
    <ToastProvider label="Notifications" closeLabel="Close">
      <FunctionsClientContext value={() => api}>
        <WriteMessageDialog target={target} open onOpenChange={onOpenChange} />
      </FunctionsClientContext>
    </ToastProvider>,
  );
  return { sent, onOpenChange };
}

describe("Write a message (2.4b)", () => {
  it("sends the proctor's own words to the group, trimmed, with a counter up to 280", async () => {
    const { sent, onOpenChange } = setup();
    expect(screen.getByText("Goes to everyone in Group 204 as typed, without translation.")).toBeTruthy();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send.hasAttribute("disabled")).toBe(true);
    const field = screen.getByRole("textbox", { name: "Message" });
    expect(field.getAttribute("maxlength")).toBe("280");
    fireEvent.change(field, { target: { value: " Ten minutes left " } });
    expect(screen.getByText("18/280")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          exam_id: EXAM_ID,
          scope: "group",
          type: "message",
          payload: { text: "Ten minutes left", scope: "group" },
        },
      ]),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the dialog open and shows an error toast when the command fails", async () => {
    const { onOpenChange } = setup("forbidden", {
      scope: "student",
      sessionId: sessionId(1),
      name: "Madina T.",
    });
    expect(screen.getByText("Goes to Madina T. as typed, without translation.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Sit up, please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("You can’t send commands for this exam.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

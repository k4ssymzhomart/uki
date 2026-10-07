// Who a proctor message goes to, and the command request that sends it.
import type { CommandRequest, MessagePreset } from "@uki/contracts";
import { MESSAGE_TEXT_MAX } from "@uki/contracts";

export type MessageTarget =
  /** Every session of the exam in rules, ready, writing or paused. `label` is "Group 204". */
  | { scope: "group"; examId: string; label: string }
  /** One student; `name` is the wall's short name, "Madina T.". */
  | { scope: "student"; sessionId: string; name: string };

/** 2.4b's presets with keys 1 to 3: the group gets "Phones away, please", one student "Put the phone away". */
export function presetsFor(target: MessageTarget): readonly MessagePreset[] {
  return target.scope === "group"
    ? ["message.preset.time_15", "message.preset.phones_away", "message.preset.camera_view"]
    : ["message.preset.time_15", "message.preset.phone_away", "message.preset.camera_view"];
}

export type MessageContent = { preset: MessagePreset } | { text: string };

/** The `command` request for a message; text is trimmed and must be 1 to 280 characters. */
export function messageRequest(target: MessageTarget, content: MessageContent): CommandRequest | null {
  if ("text" in content) {
    const text = content.text.trim();
    if (text.length === 0 || text.length > MESSAGE_TEXT_MAX) return null;
    return target.scope === "group"
      ? { exam_id: target.examId, scope: "group", type: "message", payload: { text, scope: "group" } }
      : { session_id: target.sessionId, type: "message", payload: { text, scope: "student" } };
  }
  return target.scope === "group"
    ? {
        exam_id: target.examId,
        scope: "group",
        type: "message",
        payload: { preset: content.preset, scope: "group" },
      }
    : {
        session_id: target.sessionId,
        type: "message",
        payload: { preset: content.preset, scope: "student" },
      };
}

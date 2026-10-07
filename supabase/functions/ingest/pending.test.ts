import { describe, expect, it } from "vitest";
import { PENDING_COMMANDS_MAX } from "../_shared/contracts/index.ts";
import { pendingCommands } from "./pending.ts";

const SESSION = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405163";
const EXAM = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405162";
const id = (n: number) => `0199a9d2-4c3e-7a10-8b2c-${String(n).padStart(12, "0")}`;

function row(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: id(n),
    session_id: SESSION,
    exam_id: EXAM,
    type: "message",
    payload: { preset: "message.preset.phones_away", scope: "student" },
    issued_at: `2026-10-09T10:40:0${n % 10}.123456+00:00`,
    by_name: "Aigerim Sadykova",
    ...overrides,
  };
}

describe("pendingCommands", () => {
  it("keeps valid commands in their order", () => {
    const commands = pendingCommands([row(1), row(2, { type: "pause", payload: {} })]);
    expect(commands.map((c) => [c.id, c.type, c.by_name])).toEqual([
      [id(1), "message", "Aigerim Sadykova"],
      [id(2), "pause", "Aigerim Sadykova"],
    ]);
  });

  it("leaves out a row that does not fit, and says so", () => {
    const dropped: string[] = [];
    const commands = pendingCommands(
      [row(1), row(2, { type: "add_time", payload: { minutes: 0, scope: "student" } }), row(3)],
      (issues) => dropped.push(issues),
    );
    expect(commands.map((c) => c.id)).toEqual([id(1), id(3)]);
    expect(dropped).toHaveLength(1);
  });

  it("sends at most PENDING_COMMANDS_MAX", () => {
    const rows = Array.from({ length: PENDING_COMMANDS_MAX + 3 }, (_, i) => row(i + 1));
    expect(pendingCommands(rows)).toHaveLength(PENDING_COMMANDS_MAX);
  });
});

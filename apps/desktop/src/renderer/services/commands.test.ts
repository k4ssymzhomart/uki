import type { CommandMessage, SessionCommandRow } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outbox } from "../outbox/outbox.ts";
import { EXAM_ID, flushIo, freshOutbox, SESSION_ID } from "../test/harness.ts";
import { CommandRouter, type FlowCommand } from "./commands.ts";
import { ServiceError } from "./errors.ts";
import type { RealtimeStatus, StudentApi } from "./student-api.ts";

// IndexedDB work runs on real macrotasks between fake-clock steps; a loaded CI machine needs time.
vi.setConfig({ testTimeout: 30_000 });

const STAFF = "d0000000-0000-4000-8000-000000000002";

function row(
  id: string,
  type: SessionCommandRow["type"],
  payload: object,
  issuedAt: string,
): SessionCommandRow {
  return {
    id,
    session_id: SESSION_ID,
    exam_id: EXAM_ID,
    issued_by: STAFF,
    issued_at: issuedAt,
    acked_at: null,
    type,
    payload,
  } as SessionCommandRow;
}

class FakeCommandsApi implements Pick<StudentApi, "unackedCommands" | "ackCommand" | "subscribeCommands"> {
  rows: SessionCommandRow[] = [];
  acked: string[] = [];
  ackFails = 0;
  onCommand: ((command: CommandMessage) => void) | null = null;
  onStatus: ((status: RealtimeStatus) => void) | null = null;

  async unackedCommands(): Promise<SessionCommandRow[]> {
    return this.rows.filter((r) => !this.acked.includes(r.id));
  }
  async ackCommand(id: string): Promise<void> {
    if (this.ackFails > 0) {
      this.ackFails -= 1;
      throw new ServiceError("network", "offline");
    }
    this.acked.push(id);
  }
  async subscribeCommands(
    _sessionId: string,
    handlers: { onCommand(command: CommandMessage): void; onStatus(status: RealtimeStatus): void },
  ) {
    this.onCommand = handlers.onCommand;
    this.onStatus = handlers.onStatus;
    return { close() {} };
  }
  broadcast(source: SessionCommandRow, byName: string): void {
    const { issued_by: _by, acked_at: _acked, ...rest } = source;
    this.onCommand?.({ ...rest, by_name: byName } as CommandMessage);
  }
}

let outbox: Outbox;
let api: FakeCommandsApi;
let applied: FlowCommand[];
let router: CommandRouter;

beforeEach(async () => {
  outbox = freshOutbox();
  api = new FakeCommandsApi();
  applied = [];
  router = new CommandRouter({ api, outbox, sessionId: SESSION_ID, apply: (c) => applied.push(c) });
  await router.start();
});

afterEach(async () => {
  router.stop();
  await outbox.db.delete();
});

describe("proctor commands", () => {
  it("applies a broadcast command once and acks it", async () => {
    const pause = row(
      "0199a000-0000-7000-8000-0000000000a1",
      "pause",
      { text: "Stay in your seat." },
      "2026-10-09T10:49:30.000Z",
    );
    api.rows.push(pause);
    api.broadcast(pause, "Aigerim Sadykova");
    api.broadcast(pause, "Aigerim Sadykova");
    api.onStatus?.("SUBSCRIBED");
    await flushIo(100);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      type: "pause",
      byName: "Aigerim Sadykova",
      payload: { text: "Stay in your seat." },
    });
    expect(applied[0]?.issuedAt).toBe(Date.parse("2026-10-09T10:49:30.000Z"));
    expect(api.acked).toEqual([pause.id]);
    expect((await outbox.command(pause.id))?.ackedAt).not.toBeNull();
  });

  it("reads unacked commands in order on (re)connect and applies each once", async () => {
    const message = row(
      "0199a000-0000-7000-8000-0000000000b1",
      "message",
      { preset: "message.preset.phones_away", scope: "student" },
      "2026-10-09T10:31:00.000Z",
    );
    const addTime = row(
      "0199a000-0000-7000-8000-0000000000b2",
      "add_time",
      { minutes: 10, scope: "group" },
      "2026-10-09T10:31:05.000Z",
    );
    api.rows.push(message, addTime);
    api.ackFails = 1;
    api.onStatus?.("SUBSCRIBED");
    await flushIo(100);
    expect(applied.map((c) => c.type)).toEqual(["message", "add_time"]);
    expect(applied[0]?.byName).toBeNull();
    // The first ack failed: a rejoin acks it without applying it again.
    expect(api.acked).toEqual([addTime.id]);
    api.onStatus?.("SUBSCRIBED");
    await flushIo(100);
    expect(applied).toHaveLength(2);
    expect(api.acked.sort()).toEqual([message.id, addTime.id].sort());
  });

  it("does not apply again after a restart", async () => {
    const end = row(
      "0199a000-0000-7000-8000-0000000000c1",
      "end",
      { reason: "Phone used twice" },
      "2026-10-09T10:58:12.000Z",
    );
    api.rows.push(end);
    api.ackFails = 1;
    api.onStatus?.("SUBSCRIBED");
    await flushIo(100);
    router.stop();
    const restarted: FlowCommand[] = [];
    const again = new CommandRouter({ api, outbox, sessionId: SESSION_ID, apply: (c) => restarted.push(c) });
    await again.start();
    api.onStatus?.("SUBSCRIBED");
    await flushIo(100);
    expect(restarted).toHaveLength(0);
    expect(api.acked).toEqual([end.id]);
    again.stop();
  });

  it("takes the issuer's name from a catch-up row (session_commands.by_name)", async () => {
    const pause = {
      ...row("0199a000-0000-7000-8000-0000000000e1", "pause", {}, "2026-10-09T10:20:00.000Z"),
      by_name: "Aigerim Sadykova",
    } as SessionCommandRow;
    const unnamed = {
      ...row("0199a000-0000-7000-8000-0000000000e2", "resume", {}, "2026-10-09T10:21:00.000Z"),
      by_name: "",
    } as SessionCommandRow;
    api.rows.push(pause, unnamed);
    api.onStatus?.("SUBSCRIBED");
    await flushIo(100);
    expect(applied.map((c) => [c.type, c.byName])).toEqual([
      ["pause", "Aigerim Sadykova"],
      ["resume", null],
    ]);
  });

  it("applies the commands an ingest reply carries once, oldest first, and acks them", async () => {
    const message = row(
      "0199a000-0000-7000-8000-0000000000f1",
      "message",
      { text: "Eyes on your screen", scope: "student" },
      "2026-10-09T10:30:00.000Z",
    );
    const pause = row("0199a000-0000-7000-8000-0000000000f2", "pause", {}, "2026-10-09T10:31:00.000Z");
    const pending = [message, pause].map((source) => {
      const { issued_by: _by, acked_at: _acked, ...rest } = source;
      return { ...rest, by_name: "Aigerim Sadykova" } as CommandMessage;
    });
    // The broadcast of the message arrived; the pause's was lost.
    api.broadcast(message, "Aigerim Sadykova");
    await flushIo(50);
    await router.deliver(pending);
    await router.deliver(pending);
    await flushIo(100);
    expect(applied.map((c) => [c.id, c.byName])).toEqual([
      [message.id, "Aigerim Sadykova"],
      [pause.id, "Aigerim Sadykova"],
    ]);
    expect([...new Set(api.acked)].sort()).toEqual([message.id, pause.id].sort());
    expect((await outbox.command(pause.id))?.ackedAt).not.toBeNull();
  });

  it("ignores pending commands of another session and does nothing once stopped", async () => {
    const other = {
      ...row("0199a000-0000-7000-8000-0000000000f3", "pause", {}, "2026-10-09T10:32:00.000Z"),
      session_id: EXAM_ID,
    };
    const { issued_by: _by, acked_at: _acked, ...rest } = other;
    await router.deliver([{ ...rest, by_name: "X" } as CommandMessage]);
    router.stop();
    const late = row("0199a000-0000-7000-8000-0000000000f4", "pause", {}, "2026-10-09T10:33:00.000Z");
    const { issued_by: _by2, acked_at: _acked2, ...lateRest } = late;
    await router.deliver([{ ...lateRest, by_name: "X" } as CommandMessage]);
    await flushIo(50);
    expect(applied).toHaveLength(0);
    expect(api.acked).toEqual([]);
  });

  it("ignores a command whose payload does not fit its type", async () => {
    const bad = row(
      "0199a000-0000-7000-8000-0000000000d1",
      "add_time",
      { minutes: 0, scope: "student" },
      "2026-10-09T10:00:00.000Z",
    );
    api.broadcast(bad, "X");
    await flushIo(50);
    expect(applied).toHaveLength(0);
  });

  it("shares a catch-up read that is running, and reports whether the list was read", async () => {
    const pause = row("0199a000-0000-7000-8000-0000000000a9", "pause", {}, "2026-10-09T10:49:30.000Z");
    api.rows.push(pause);
    let reads = 0;
    const unacked = api.unackedCommands.bind(api);
    api.unackedCommands = async () => {
      reads += 1;
      return unacked();
    };
    // SUBSCRIBED starts a read; a restart into a paused session waits for the same one.
    api.onStatus?.("SUBSCRIBED");
    expect(await router.catchUp()).toBe(true);
    expect(reads).toBe(1);
    expect(applied.map((c) => c.type)).toEqual(["pause"]);
    api.unackedCommands = async () => {
      throw new ServiceError("network", "offline");
    };
    expect(await router.catchUp()).toBe(false);
    router.stop();
    expect(await router.catchUp()).toBe(false);
  });
});

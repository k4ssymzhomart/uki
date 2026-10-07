import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAM_ID, pgTime, SESSION_ID, STAFF_ID, T0 } from "../test/fixtures.ts";
import {
  AddTimePayload,
  COMMAND_TYPES,
  CommandBroadcast,
  EndPayload,
  MESSAGE_PRESETS,
  MessagePayload,
  PausePayload,
  PENDING_COMMANDS_MAX,
  parseCommandPayload,
  ResumePayload,
  SessionCommandRow,
  StartPayload,
} from "./commands.ts";
import { uuidv7 } from "./ids.ts";

const catalog = JSON.parse(readFileSync(new URL("../../i18n/catalog.json", import.meta.url), "utf8")) as {
  keys: { key: string }[];
};

describe("command types and presets", () => {
  it("mirrors the SQL enum command_type", () => {
    expect(COMMAND_TYPES).toEqual(["pause", "resume", "end", "message", "add_time", "start"]);
  });

  it("lists exactly the catalog's message.preset.* keys", () => {
    const keys = catalog.keys.map((k) => k.key).filter((k) => k.startsWith("message.preset."));
    expect([...MESSAGE_PRESETS].sort()).toEqual(keys.sort());
  });
});

describe("payloads", () => {
  it("message: exactly one of preset or text, with a scope", () => {
    expect(MessagePayload.safeParse({ preset: "message.preset.phones_away", scope: "group" }).success).toBe(
      true,
    );
    expect(MessagePayload.safeParse({ text: "Eyes on your own screen", scope: "student" }).success).toBe(
      true,
    );
    expect(
      MessagePayload.safeParse({ preset: "message.preset.phones_away", text: "hi", scope: "group" }).success,
    ).toBe(false);
    expect(MessagePayload.safeParse({ scope: "group" }).success).toBe(false);
    expect(MessagePayload.safeParse({ preset: "message.preset.time_15" }).success).toBe(false);
    expect(MessagePayload.safeParse({ preset: "message.title", scope: "group" }).success).toBe(false);
  });

  it("message text: 1 to 280 characters after trimming", () => {
    expect(MessagePayload.safeParse({ text: "x".repeat(280), scope: "student" }).success).toBe(true);
    expect(MessagePayload.safeParse({ text: "x".repeat(281), scope: "student" }).success).toBe(false);
    expect(MessagePayload.safeParse({ text: "   ", scope: "student" }).success).toBe(false);
  });

  it("add_time: whole minutes from 1 to 60", () => {
    expect(AddTimePayload.safeParse({ minutes: 1, scope: "group" }).success).toBe(true);
    expect(AddTimePayload.safeParse({ minutes: 60, scope: "student" }).success).toBe(true);
    expect(AddTimePayload.safeParse({ minutes: 0, scope: "group" }).success).toBe(false);
    expect(AddTimePayload.safeParse({ minutes: 61, scope: "group" }).success).toBe(false);
    expect(AddTimePayload.safeParse({ minutes: 2.5, scope: "group" }).success).toBe(false);
    expect(AddTimePayload.safeParse({ minutes: 5, scope: "room" }).success).toBe(false);
  });

  it("end: a reason from 1 to 200 characters", () => {
    expect(EndPayload.safeParse({ reason: "Second person in the room" }).success).toBe(true);
    expect(EndPayload.safeParse({ reason: "" }).success).toBe(false);
    expect(EndPayload.safeParse({ reason: "x".repeat(201) }).success).toBe(false);
    expect(EndPayload.safeParse({}).success).toBe(false);
  });

  it("pause, resume and start take nothing else", () => {
    expect(ResumePayload.safeParse({}).success).toBe(true);
    expect(StartPayload.safeParse({}).success).toBe(true);
    expect(PausePayload.safeParse({}).success).toBe(true);
    expect(PausePayload.safeParse({ text: "Camera check, wait for me" }).success).toBe(true);
    expect(ResumePayload.safeParse({ minutes: 5 }).success).toBe(false);
    expect(StartPayload.safeParse({ at: "now" }).success).toBe(false);
  });

  it("parseCommandPayload picks the schema by type", () => {
    expect(parseCommandPayload("add_time", { minutes: 10, scope: "group" })).toEqual({
      success: true,
      data: { minutes: 10, scope: "group" },
    });
    expect(parseCommandPayload("end", { minutes: 10 }).success).toBe(false);
  });
});

describe("pending commands on ingest", () => {
  it("sends at most 20 a call", () => {
    expect(PENDING_COMMANDS_MAX).toBe(20);
  });
});

describe("rows and broadcasts", () => {
  const base = {
    id: uuidv7(),
    session_id: SESSION_ID,
    exam_id: EXAM_ID,
    issued_at: pgTime(T0),
  };

  it("parses a session_commands row", () => {
    const row = SessionCommandRow.parse({
      ...base,
      issued_by: STAFF_ID,
      acked_at: null,
      type: "add_time",
      payload: { minutes: 10, scope: "group" },
    });
    expect(row.type === "add_time" && row.payload.minutes).toBe(10);
  });

  it("reads by_name on a session_commands row, leniently", () => {
    const row = {
      ...base,
      issued_by: STAFF_ID,
      acked_at: null,
      type: "pause",
      payload: { text: "Stay seated" },
    } as const;
    expect(SessionCommandRow.parse({ ...row, by_name: "Aigerim Sadykova" }).by_name).toBe("Aigerim Sadykova");
    expect(SessionCommandRow.parse(row).by_name, "a row read without the column").toBeUndefined();
    expect(SessionCommandRow.parse({ ...row, by_name: null }).by_name).toBeNull();
    expect(SessionCommandRow.safeParse({ ...row, by_name: 7 }).success).toBe(false);
  });

  it("parses a command broadcast with by_name", () => {
    const message = CommandBroadcast.parse({
      ...base,
      by_name: "Aigerim Sadykova",
      type: "message",
      payload: { preset: "message.preset.phones_away", scope: "group" },
    });
    expect(message.by_name).toBe("Aigerim Sadykova");
  });

  it("rejects a payload that does not fit its type", () => {
    expect(
      CommandBroadcast.safeParse({ ...base, by_name: "Aigerim", type: "end", payload: { minutes: 10 } })
        .success,
    ).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "../services/errors.ts";
import { FakeServer } from "../test/fake-server.ts";
import {
  advance,
  EXAM_ID,
  envelopeFor,
  flushIo,
  freshOutbox,
  jpegBytes,
  QUESTION_IDS,
  SESSION_ID,
  useFakeClock,
} from "../test/harness.ts";
import type { Outbox } from "./outbox.ts";
import { type Connectivity, SyncLoop } from "./sync.ts";

// IndexedDB work runs on real macrotasks between fake-clock steps; a loaded CI machine needs time.
vi.setConfig({ testTimeout: 30_000 });

let outbox: Outbox;
let server: FakeServer;
let loop: SyncLoop | null = null;

function startLoop(extra: Partial<ConstructorParameters<typeof SyncLoop>[0]> = {}): SyncLoop {
  loop = new SyncLoop({ api: server, outbox, sessionId: SESSION_ID, ...extra });
  loop.start();
  return loop;
}

beforeEach(() => {
  useFakeClock();
  outbox = freshOutbox();
  server = new FakeServer({ examId: EXAM_ID, now: () => Date.now() });
});

afterEach(async () => {
  loop?.stop();
  loop = null;
  await outbox.db.delete();
  vi.useRealTimers();
});

describe("outbox order", () => {
  it("numbers events per session from 0 and keeps the count across a restart", async () => {
    for (let i = 0; i < 3; i += 1)
      await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
    expect(await outbox.nextSeq(SESSION_ID)).toBe(3);
    // A restart opens the same database again.
    const again = freshOutbox(outbox.db.name);
    await outbox.db.close();
    expect(await again.nextSeq(SESSION_ID)).toBe(3);
    const row = await again.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
    expect(row.seq).toBe(3);
    outbox = again;
  });

  it("upserts answers before ingest and sends events in seq order, at most 50 a call", async () => {
    await outbox.saveAnswer(SESSION_ID, QUESTION_IDS[0] ?? "", "a", new Date().toISOString());
    for (let i = 0; i < 60; i += 1)
      await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("answer.saved", seq));
    startLoop();
    await flushIo(200);
    await advance(2_000);
    const kinds = server.calls.map((call) => call.kind);
    expect(kinds[0]).toBe("answers");
    expect(kinds[1]).toBe("ingest");
    expect(server.calls[1]?.size).toBe(50);
    expect(server.events.size).toBe(60);
    const seqs = [...server.events.values()].map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(await outbox.isEmpty(SESSION_ID)).toBe(true);
  });

  it("keeps the later answer when the student changes a choice while a call runs", async () => {
    const question = QUESTION_IDS[1] ?? "";
    await outbox.saveAnswer(SESSION_ID, question, "a", "2026-10-09T10:00:00.000Z");
    const pending = await outbox.unsyncedAnswers(SESSION_ID);
    await outbox.saveAnswer(SESSION_ID, question, "b", "2026-10-09T10:00:01.000Z");
    await outbox.markAnswers(
      pending.map((row) => ({
        session_id: row.sessionId,
        question_id: row.questionId,
        choice_id: row.choiceId,
        saved_at: row.savedAt,
      })),
      "synced",
    );
    const left = await outbox.unsyncedAnswers(SESSION_ID);
    expect(left.map((row) => row.choiceId)).toEqual(["b"]);
  });

  it("sends a refused batch of answers one at a time and sets aside only the rows refused", async () => {
    // RLS refuses an answer saved at or after the session's end, and with it the whole statement.
    const end = Date.now() + 60_000;
    const upsert = server.upsertAnswers.bind(server);
    server.upsertAnswers = async (rows) => {
      if (rows.some((row) => Date.parse(row.saved_at) >= end)) {
        server.calls.push({ kind: "answers", at: Date.now(), size: rows.length });
        throw new ServiceError("forbidden", "new row violates row-level security policy", 403);
      }
      return upsert(rows);
    };
    const [q1, q2, q3] = [QUESTION_IDS[0] ?? "", QUESTION_IDS[1] ?? "", QUESTION_IDS[2] ?? ""];
    await outbox.saveAnswer(SESSION_ID, q1, "a", new Date(end - 120_000).toISOString());
    await outbox.saveAnswer(SESSION_ID, q2, "b", new Date(end - 60_000).toISOString());
    await outbox.saveAnswer(SESSION_ID, q3, "c", new Date(end + 60_000).toISOString());
    startLoop();
    await flushIo(200);
    await advance(2_000);
    expect(server.answers.get(`${SESSION_ID}/${q1}`)?.choice_id).toBe("a");
    expect(server.answers.get(`${SESSION_ID}/${q2}`)?.choice_id).toBe("b");
    expect(server.answers.has(`${SESSION_ID}/${q3}`)).toBe(false);
    const rows = await outbox.answers(SESSION_ID);
    const synced = rows.filter((row) => row.syncedAt !== null).map((row) => row.questionId);
    expect(synced.sort()).toEqual([q1, q2].sort());
    expect(rows.filter((row) => row.rejectedAt !== null).map((row) => row.questionId)).toEqual([q3]);
    // The loop goes on: the refused row is not a reason to stop syncing.
    expect(loop?.isStarted).toBe(true);
  });
});

describe("idempotent resend", () => {
  it("resends a batch whose reply was lost and the server stores each event once", async () => {
    for (let i = 0; i < 5; i += 1)
      await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
    server.dropReplies = 1;
    startLoop();
    await flushIo(200);
    expect(server.events.size).toBe(5);
    expect(await outbox.unsentEvents(SESSION_ID)).toHaveLength(5);
    await advance(2_000);
    const ingests = server.calls.filter((call) => call.kind === "ingest");
    expect(ingests.length).toBeGreaterThanOrEqual(2);
    expect(ingests[1]?.size).toBe(5);
    expect(server.events.size).toBe(5);
    expect(await outbox.unsentEvents(SESSION_ID)).toHaveLength(0);
  });
});

describe("backoff", () => {
  it("retries after 2, 4, 8, 16, then every 30 seconds", async () => {
    server.online = false;
    await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
    const start = Date.now();
    startLoop();
    await flushIo(100);
    await advance(150_000, 500);
    const times = server.calls.map((call) => Math.round((call.at - start) / 1000));
    expect(times.slice(0, 8)).toEqual([0, 2, 6, 14, 30, 60, 90, 120]);
  });

  it("tries again at once when the network comes back during a failing call", async () => {
    let release: (() => void) | null = null;
    const slow = new FakeServer({ examId: EXAM_ID, now: () => Date.now() });
    const original = slow.ingest.bind(slow);
    let hang = false;
    slow.ingest = async (request) => {
      if (hang) {
        // A call that hangs, then fails, like a dropped connection.
        hang = false;
        slow.calls.push({ kind: "ingest", at: Date.now(), size: request.events.length });
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new ServiceError("network", "connection dropped");
      }
      return original(request);
    };
    server = slow;
    await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
    server.online = false;
    startLoop();
    await flushIo(50);
    await advance(20_000, 500);
    // The network returns while the next call is stuck; the OS reports it (online event) mid-call.
    server.online = true;
    hang = true;
    loop?.nudge();
    await flushIo(50);
    expect(hang).toBe(false);
    loop?.nudge();
    (release as (() => void) | null)?.();
    await flushIo(200);
    await advance(250);
    expect(server.events.size).toBe(1);
  });

  it("calls ingest at least every 10 s with an empty batch and the status", async () => {
    startLoop({ getStatus: () => ({ question: 7 }) });
    await flushIo(100);
    await advance(31_000, 500);
    const ingests = server.calls.filter((call) => call.kind === "ingest");
    expect(ingests.length).toBeGreaterThanOrEqual(4);
    expect(ingests.every((call) => call.size === 0)).toBe(true);
    const gaps = ingests.slice(1).map((call, i) => call.at - (ingests[i]?.at ?? 0));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(10_500);
    expect(server.statuses.at(-1)).toEqual({ question: 7 });
  });

  it("keeps the heartbeat at 10 s when a slow run shifts the 2 s ticks (P.10)", async () => {
    // A run that takes long (a loaded laptop) moves every later 2 s tick. The heartbeat was checked
    // only on those ticks, so one at 9.95 s missed it and the call came at 11.95 s: a command whose
    // broadcast was lost waited 2 s longer than "within about 10 s".
    const settle = outbox.settle.bind(outbox);
    let slowRuns = 1;
    outbox.settle = async (sessionId) => {
      await settle(sessionId);
      if (server.calls.length === 1 && slowRuns > 0) {
        slowRuns -= 1;
        await new Promise((resolve) => setTimeout(resolve, 1950));
      }
    };
    startLoop({ getStatus: () => ({ question: 7 }) });
    await flushIo(100);
    await advance(25_000, 50);
    const ingests = server.calls.filter((call) => call.kind === "ingest");
    expect(slowRuns).toBe(0);
    expect(ingests.length).toBeGreaterThanOrEqual(3);
    const gaps = ingests.slice(1).map((call, i) => call.at - (ingests[i]?.at ?? 0));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(10_100);
  });
});

describe("546 WORKER_LIMIT and gateway 502, 503, 504", () => {
  const statuses = [546, 502, 503, 504];

  it.each(statuses)(
    "%i: backs off 2, 4, 8, 16, 30 s, sets nothing aside, then sends everything once",
    async (status) => {
      const fatal = vi.fn();
      server.failStatus.answers = status;
      server.failStatus.ingest = status;
      await outbox.saveAnswer(SESSION_ID, QUESTION_IDS[0] ?? "", "a", new Date().toISOString());
      for (let i = 0; i < 3; i += 1)
        await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
      const start = Date.now();
      startLoop({ onFatal: fatal });
      await flushIo(100);
      await advance(31_000, 500);
      expect(server.calls.map((call) => Math.round((call.at - start) / 1000))).toEqual([0, 2, 6, 14, 30]);
      // The answers pass; ingest still answers the status: the same backoff, nothing set aside.
      delete server.failStatus.answers;
      await advance(60_000, 500);
      const ingests = server.calls.filter((call) => call.kind === "ingest");
      expect(ingests.map((call) => Math.round((call.at - start) / 1000))).toEqual([60, 90]);
      expect(fatal).not.toHaveBeenCalled();
      expect(loop?.isStarted).toBe(true);
      expect(await outbox.unsentEvents(SESSION_ID)).toHaveLength(3);
      expect((await outbox.answers(SESSION_ID)).every((row) => row.rejectedAt === null)).toBe(true);

      delete server.failStatus.ingest;
      await advance(31_000, 500);
      expect(server.answers.size).toBe(1);
      expect(server.events.size).toBe(3);
      expect(await outbox.isEmpty(SESSION_ID)).toBe(true);
    },
  );

  it.each(statuses)(
    "%i: keeps a still's URL and retries the upload and frames, without resending the event",
    async (status) => {
      const row = await outbox.enqueueEvent(SESSION_ID, (seq) =>
        envelopeFor("phone.detected", seq, { frame_count: 1 }),
      );
      await outbox.addStill({
        sessionId: SESSION_ID,
        eventId: row.id,
        index: 0,
        at: Date.now(),
        bytes: jpegBytes(),
      });
      server.failStatus.upload = status;
      startLoop();
      await flushIo(300);
      await advance(7_000, 500);
      expect(server.calls.filter((call) => call.kind === "upload").length).toBeGreaterThanOrEqual(2);
      expect(server.objects.size).toBe(0);
      expect((await outbox.sessionStills(SESSION_ID)).map((still) => still.state)).toEqual(["pending"]);

      delete server.failStatus.upload;
      server.failStatus.frames = status;
      await advance(9_000, 500);
      expect(server.objects.size).toBe(1);
      expect(server.frames.size).toBe(0);
      expect((await outbox.sessionStills(SESSION_ID)).map((still) => still.state)).toEqual(["uploaded"]);

      delete server.failStatus.frames;
      await advance(17_000, 500);
      expect(server.frames.size).toBe(1);
      expect(await outbox.event(row.id)).toBeUndefined();
      // One URL served every try: the event went up once, never again for a fresh URL.
      expect(server.calls.filter((call) => call.kind === "ingest" && call.size > 0)).toHaveLength(1);
    },
  );
});

describe("the OS reports the cut", () => {
  it("calls at once on probe(), so offline shows 5 s after the cut rather than at the next heartbeat", async () => {
    const changes: Connectivity[] = [];
    startLoop({ onConnectivity: (state) => changes.push(state) });
    await flushIo(100);
    await advance(3_000);
    const before = server.ingestCalls;
    const cutAt = Date.now();
    server.online = false;
    loop?.probe();
    await flushIo(50);
    expect(server.calls.at(-1)).toMatchObject({ kind: "ingest", at: cutAt });
    expect(server.ingestCalls).toBe(before);
    await advance(6_000);
    const offline = changes.find((change) => change.offline);
    expect(offline?.since).toBe(cutAt);
  });
});

describe("a 2-minute network cut", () => {
  it("shows offline after 5 s, loses nothing, duplicates nothing and reports net.offline", async () => {
    const changes: Connectivity[] = [];
    let reconnectInfo: { offlineMs: number; queued: number } | null = null;
    startLoop({
      onConnectivity: (state) => changes.push(state),
      onReconnect: async (info) => {
        reconnectInfo = info;
        await outbox.enqueueEvent(SESSION_ID, (seq) =>
          envelopeFor("net.offline", seq, { data: { offline_ms: info.offlineMs, queued: info.queued } }),
        );
      },
    });
    await flushIo(100);
    await advance(3_000);
    expect(server.ingestCalls).toBeGreaterThan(0);

    const cutAt = Date.now();
    server.online = false;
    // Writing goes on: an answer every 10 s and an event every 5 s for two minutes.
    for (let second = 0; second < 120; second += 5) {
      await outbox.enqueueEvent(SESSION_ID, (seq) => envelopeFor("gaze.on_screen", seq));
      if (second % 10 === 0) {
        await outbox.saveAnswer(SESSION_ID, QUESTION_IDS[second / 10] ?? "", "c", new Date().toISOString());
      }
      loop?.kick();
      await advance(5_000);
    }
    const offlineChange = changes.find((change) => change.offline);
    expect(offlineChange).toBeDefined();
    expect((offlineChange?.since ?? 0) - cutAt).toBeLessThanOrEqual(2_500);
    expect(server.events.size).toBeLessThan(10);

    server.online = true;
    loop?.nudge();
    await flushIo(300);
    await advance(4_000);

    expect(changes.at(-1)).toEqual({ offline: false, since: null });
    expect(reconnectInfo).not.toBeNull();
    const info = reconnectInfo as unknown as { offlineMs: number; queued: number };
    expect(info.offlineMs).toBeGreaterThanOrEqual(115_000);
    expect(info.queued).toBe(24 + 12);
    expect(server.answers.size).toBe(12);
    expect(server.ofType("gaze.on_screen")).toHaveLength(24);
    const offline = server.ofType("net.offline");
    expect(offline).toHaveLength(1);
    expect(offline[0]?.data).toMatchObject({ queued: 36 });
    // Every queued event arrived exactly once and in seq order.
    const seqs = [...server.events.values()].map((event) => event.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(seqs.map((_, i) => i));
    expect(await outbox.isEmpty(SESSION_ID)).toBe(true);
    // Answers went up before the events of the first call after the cut.
    const afterCut = server.calls.filter((call) => call.at >= cutAt + 120_000 && call.kind !== "upload");
    expect(afterCut[0]?.kind).toBe("answers");
  });
});

describe("stills", () => {
  it("uploads a flag event's stills, confirms them and deletes the laptop copies", async () => {
    const row = await outbox.enqueueEvent(SESSION_ID, (seq) =>
      envelopeFor("phone.detected", seq, { frame_count: 3 }),
    );
    for (let index = 0; index < 3; index += 1) {
      await outbox.addStill({
        sessionId: SESSION_ID,
        eventId: row.id,
        index,
        at: Date.now() + index * 1000,
        bytes: jpegBytes(),
      });
    }
    startLoop();
    await flushIo(300);
    await advance(2_000);
    expect(server.objects.size).toBe(3);
    expect(server.frames.size).toBe(3);
    expect(await outbox.sessionStills(SESSION_ID)).toHaveLength(0);
    expect(await outbox.event(row.id)).toBeUndefined();
  });

  it("uploads a still that arrives after its event with the URL from the first reply", async () => {
    const row = await outbox.enqueueEvent(SESSION_ID, (seq) =>
      envelopeFor("phone.detected", seq, { frame_count: 3 }),
    );
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 0,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    startLoop();
    await flushIo(300);
    expect(server.frames.size).toBe(1);
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 1,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 2,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    await advance(2_000);
    expect(server.frames.size).toBe(3);
    // The first reply's URLs serve the later stills; a resend (duplicate) is allowed but not needed.
    expect(server.events.size).toBe(1);
    expect(await outbox.event(row.id)).toBeUndefined();
  });

  it("gets fresh URLs by resending the event after a restart, and gives up stills never taken", async () => {
    const row = await outbox.enqueueEvent(SESSION_ID, (seq) =>
      envelopeFor("face.missing", seq, { frame_count: 3 }),
    );
    startLoop();
    await flushIo(300);
    loop?.stop();
    // The app restarts: the first loop's URLs are gone. Two stills were saved, one never came.
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 0,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 1,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    const before = server.ingestCalls;
    startLoop();
    await flushIo(300);
    await advance(2_000);
    expect(server.ingestCalls).toBeGreaterThan(before);
    expect(server.frames.size).toBe(2);
    expect(await outbox.event(row.id)).toBeDefined();
    await advance(25_000, 1000);
    expect(await outbox.event(row.id)).toBeUndefined();
    expect(await outbox.isEmpty(SESSION_ID)).toBe(true);
  });

  it("confirms a still whose upload went through unseen: the URL answers already exists, nothing is replaced", async () => {
    const row = await outbox.enqueueEvent(SESSION_ID, (seq) =>
      envelopeFor("phone.detected", seq, { frame_count: 1 }),
    );
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 0,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    server.dropUploadReplies = 1;
    startLoop();
    await flushIo(300);
    expect(server.objects.size).toBe(1);
    expect(server.frames.size).toBe(0);
    await advance(4_000);
    // The retry with the same URL is refused ("already exists"), and frames confirms the first upload.
    expect(server.calls.filter((call) => call.kind === "upload")).toHaveLength(2);
    expect(server.frames.size).toBe(1);
    expect(await outbox.sessionStills(SESSION_ID)).toHaveLength(0);
    expect(await outbox.event(row.id)).toBeUndefined();
  });

  it("drops a still the server already holds once a restart lost its URL, without uploading it again", async () => {
    const row = await outbox.enqueueEvent(SESSION_ID, (seq) =>
      envelopeFor("phone.detected", seq, { frame_count: 1 }),
    );
    await outbox.addStill({
      sessionId: SESSION_ID,
      eventId: row.id,
      index: 0,
      at: Date.now(),
      bytes: jpegBytes(),
    });
    server.dropUploadReplies = 1;
    startLoop();
    await flushIo(300);
    loop?.stop();
    // The app restarts before it tries again: its URL is gone and the still still waits on the laptop.
    expect(server.objects.size).toBe(1);
    expect((await outbox.sessionStills(SESSION_ID)).map((still) => still.state)).toEqual(["pending"]);
    const uploads = server.calls.filter((call) => call.kind === "upload").length;
    startLoop();
    await flushIo(300);
    await advance(2_000);
    // The resent event gets no URL for it: ingest confirmed the object that was there.
    expect(server.frames.size).toBe(1);
    expect(server.calls.filter((call) => call.kind === "upload")).toHaveLength(uploads);
    expect(await outbox.sessionStills(SESSION_ID)).toHaveLength(0);
    expect(await outbox.event(row.id)).toBeUndefined();
  });
});

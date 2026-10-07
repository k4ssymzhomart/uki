import { describe, expect, it } from "vitest";
import {
  FINAL_STATES,
  INITIAL_STATE,
  isFinalState,
  nextState,
  PRE_EXAM_STATES,
  SESSION_STATES,
  SessionState,
  SessionStatus,
  STATUS_STEPS,
  type StateCause,
} from "./session.ts";

type Row = [from: SessionState, cause: StateCause, to: SessionState];

const ALL = SESSION_STATES;

describe("enums mirror the SQL", () => {
  it("has the ten session states in order", () => {
    expect(ALL).toEqual([
      "joined",
      "checking",
      "identity",
      "rules",
      "ready",
      "writing",
      "paused",
      "submitted",
      "time_up",
      "ended",
    ]);
    expect(FINAL_STATES).toEqual(["submitted", "time_up", "ended"]);
    expect(INITIAL_STATE).toBe("joined");
    expect(SessionState.safeParse("finished").success).toBe(false);
  });

  it("parses sessions.status from {} and with values", () => {
    expect(SessionStatus.parse({})).toEqual({});
    expect(SessionStatus.parse({ step: "identity", detail: "Telegram", question: 9 })).toEqual({
      step: "identity",
      detail: "Telegram",
      question: 9,
    });
    expect(SessionStatus.parse({ step: null, question: null })).toEqual({ step: null, question: null });
    expect(SessionStatus.safeParse({ step: "writing" }).success).toBe(false);
    expect(SessionStatus.safeParse({ question: 0 }).success).toBe(false);
  });
});

describe("nextState: Session states table", () => {
  // Row 1: join_exam -> joined (new sessions start there; a re-join keeps the state).
  const joinRows: Row[] = ALL.map((s) => [s, { type: "join_exam" }, s]);

  // Row 2: ingest status.step -> that step, forward only; never out of paused or a final state.
  const statusRows: Row[] = [];
  for (const from of ALL) {
    for (const step of STATUS_STEPS) {
      const order = [...PRE_EXAM_STATES] as SessionState[];
      const forward = order.includes(from) && order.indexOf(step) > order.indexOf(from);
      statusRows.push([from, { type: "status", step }, forward ? step : from]);
    }
  }

  // Row 3: exam.started -> writing from every check-in state.
  const startedRows: Row[] = ALL.map((s) => [
    s,
    { type: "exam.started" },
    (PRE_EXAM_STATES as readonly string[]).includes(s) ? "writing" : s,
  ]);

  // Row 4: session.paused or proctor.paused -> paused, from writing.
  const pausedRows: Row[] = ALL.flatMap((s): Row[] => [
    [s, { type: "session.paused" }, s === "writing" ? "paused" : s],
    [s, { type: "proctor.paused" }, s === "writing" ? "paused" : s],
  ]);

  // Row 5: session.resumed or proctor.resumed -> writing, from paused; a proctor's pause ends only
  // with proctor.resumed.
  const resumedRows: Row[] = ALL.flatMap((s): Row[] => [
    [s, { type: "session.resumed", pause: "self" }, s === "paused" ? "writing" : s],
    [s, { type: "session.resumed", pause: "proctor" }, s],
    [s, { type: "proctor.resumed" }, s === "paused" ? "writing" : s],
  ]);

  // Row 6: proctor.ended -> ended from every non-final state.
  const endedRows: Row[] = ALL.map((s) => [s, { type: "proctor.ended" }, isFinalState(s) ? s : "ended"]);

  // Rows 7 and 8: submit_session after the end -> time_up, before the end -> submitted; session_tick -> time_up.
  const submitRows: Row[] = ALL.flatMap((s): Row[] => [
    [s, { type: "submit_session", pastEnd: true }, isFinalState(s) ? s : "time_up"],
    [s, { type: "submit_session", pastEnd: false }, isFinalState(s) ? s : "submitted"],
    [s, { type: "session_tick" }, isFinalState(s) ? s : "time_up"],
  ]);

  const rows = [
    ...joinRows,
    ...statusRows,
    ...startedRows,
    ...pausedRows,
    ...resumedRows,
    ...endedRows,
    ...submitRows,
  ];

  it.each(rows)("%s + %o -> %s", (from, cause, to) => {
    expect(nextState(from, cause)).toBe(to);
  });

  it("covers every state with every cause", () => {
    expect(rows.length).toBe(ALL.length * (1 + STATUS_STEPS.length + 1 + 2 + 3 + 1 + 3));
  });

  it("ends a proctor's pause only with proctor.resumed", () => {
    let s: SessionState = nextState("writing", { type: "proctor.paused" });
    s = nextState(s, { type: "session.resumed", pause: "proctor" });
    expect(s).toBe("paused");
    s = nextState(s, { type: "proctor.resumed" });
    expect(s).toBe("writing");
  });

  it("ends a self pause with either resume", () => {
    let s: SessionState = nextState("writing", { type: "session.paused" });
    s = nextState(s, { type: "session.resumed", pause: "self" });
    expect(s).toBe("writing");
    s = nextState(s, { type: "session.paused" });
    s = nextState(s, { type: "proctor.resumed" });
    expect(s).toBe("writing");
  });

  it("keeps ended on submit, as 2.1d needs", () => {
    expect(nextState("ended", { type: "submit_session", pastEnd: false })).toBe("ended");
  });

  it("never moves backwards except writing <-> paused", () => {
    const rank = (s: SessionState) => (s === "paused" ? ALL.indexOf("writing") : ALL.indexOf(s));
    for (const [from, cause, to] of rows) {
      if (from === "paused" && to === "writing") continue;
      expect(rank(to), `${from} ${JSON.stringify(cause)}`).toBeGreaterThanOrEqual(rank(from));
    }
  });

  it("walks the happy path", () => {
    let s: SessionState = INITIAL_STATE;
    for (const step of STATUS_STEPS) s = nextState(s, { type: "status", step });
    expect(s).toBe("ready");
    s = nextState(s, { type: "exam.started" });
    s = nextState(s, { type: "session.paused" });
    expect(s).toBe("paused");
    s = nextState(s, { type: "status", step: "checking" });
    expect(s).toBe("paused");
    s = nextState(s, { type: "proctor.resumed" });
    s = nextState(s, { type: "submit_session", pastEnd: false });
    expect(s).toBe("submitted");
  });
});

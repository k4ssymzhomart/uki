// The student flow ("Student flow" in docs/phase-0-plan.md) as an XState 5 machine:
// join (1.1, 1.1a) → system check (1.2) → identity (1.3, 1.3a) → rules and lobby (1.4) → exam (2.1 with
// 2.1a, 2.1c, 2.1e, 2.2, 2.3) → submitted (3.1), or ended by the proctor (2.1d).
// The machine is pure. It emits FlowEffect events for one-off work (queue an event, save an answer);
// steady state such as lockdown, the hidden window, the detection phase and the ingest status is
// derived from the snapshot by derive.ts, and the runtime keeps the services in step with it.
import {
  type ClientEventType,
  type ExamMode,
  JOIN_ERROR_CODES,
  type JoinExamOutput,
  type Question,
  type ReleaseReason,
} from "@uki/contracts";
import { assign, emit, enqueueActions, fromPromise, setup } from "xstate";
import {
  addTime,
  effectiveEndsAt,
  endPause,
  initialTimer,
  isTimeUp,
  startPause,
  syncTimer,
} from "./timer.ts";
import {
  type FlowContext,
  type FlowEffect,
  type FlowEvent,
  type FlowInput,
  INITIAL_CHECK_ROWS,
  INITIAL_IDENTITY,
  type SavedJoin,
  type SubmitResult,
} from "./types.ts";
import type { JoinError, LogEntry } from "./view-model.ts";

/** "Step 1 of 4" form checks before any call. */
const CODE_FORMAT = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const STUDENT_NUMBER_FORMAT = /^\d{8}$/;
/** The session log keeps this many lines. */
export const LOG_CAP = 50;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidJoinInput(code: string, studentNumber: string): boolean {
  const normalized = normalizeCode(code);
  return (
    normalized.length >= 3 &&
    normalized.length <= 32 &&
    CODE_FORMAT.test(normalized) &&
    STUDENT_NUMBER_FORMAT.test(studentNumber.trim())
  );
}

/** The 1.1 error for a failed join_exam (JoinFailure carries `code`; anything else is no reply). */
export function joinErrorOf(error: unknown): JoinError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if ((JOIN_ERROR_CODES as readonly unknown[]).includes(code)) return code as JoinError;
  }
  return "network";
}

function logLine(context: FlowContext, entry: LogEntry): LogEntry[] {
  return [entry, ...context.log].slice(0, LOG_CAP);
}

let logSerial = 0;
function logId(): string {
  logSerial += 1;
  return `log-${logSerial}`;
}

function mode(context: FlowContext): ExamMode {
  return context.joined?.exam.mode ?? "app";
}

function event(eventType: ClientEventType, data: Record<string, unknown> = {}): FlowEffect {
  return { type: "effect.event", eventType, data };
}

export const studentFlowMachine = setup({
  types: {
    context: {} as FlowContext,
    events: {} as FlowEvent,
    input: {} as FlowInput,
    emitted: {} as FlowEffect,
  },
  actors: {
    /** The join kept on the laptop, to rejoin after a restart. */
    restore: fromPromise<SavedJoin | null>(async () => null),
    joinExam: fromPromise<JoinExamOutput, SavedJoin>(async () => {
      throw new Error("joinExam is provided by the runtime");
    }),
    /** join_exam again once the exam has started, until it returns the questions. */
    loadQuestions: fromPromise<Question[], SavedJoin>(async () => []),
    /** Flush the outbox, then submit_session (idempotent), retrying while offline. */
    submit: fromPromise<SubmitResult, { sessionId: string; reason: ReleaseReason }>(async () => {
      throw new Error("submit is provided by the runtime");
    }),
  },
  actions: {
    assignSync: assign({
      timer: ({ context, event: e }) =>
        e.type === "SESSION_SYNC" && context.timer
          ? syncTimer(context.timer, e.session, e.serverTime)
          : context.timer,
    }),
    assignEnded: assign(({ context, event: e }) => {
      if (e.type !== "COMMAND" || e.command.type !== "end") return {};
      return {
        ended: {
          byName: e.command.byName ?? context.joined?.proctor_name ?? null,
          at: Math.min(e.command.issuedAt, context.now),
          reason: e.command.payload.reason,
        },
        finishing: "ended" as const,
      };
    }),
    assignEndedFromSync: assign(({ context }) => ({
      ended: context.ended ?? { byName: context.joined?.proctor_name ?? null, at: context.now, reason: null },
      finishing: "ended" as const,
    })),
    assignNotice: assign(({ context, event: e }) => {
      if (e.type !== "COMMAND") return {};
      const { command } = e;
      const proctorName = command.byName ?? context.joined?.proctor_name ?? null;
      const at = Math.min(command.issuedAt, context.now);
      const notice = context.notice ?? { message: null, timeAdded: null };
      if (command.type === "message") {
        const message =
          "preset" in command.payload
            ? { at, proctorName, text: null, preset: command.payload.preset }
            : { at, proctorName, text: command.payload.text, preset: null };
        return { notice: { ...notice, message } };
      }
      if (command.type === "add_time" && context.timer) {
        const timer = addTime(context.timer, command.payload.minutes, command.issuedAt);
        const endsAt = effectiveEndsAt(timer);
        const minutes = (notice.timeAdded?.minutes ?? 0) + command.payload.minutes;
        return {
          timer,
          notice: { ...notice, timeAdded: { at, proctorName, minutes, endsAt } },
          log: logLine(context, {
            id: logId(),
            at,
            kind: "time_added",
            minutes: command.payload.minutes,
            proctorName,
            endsAt,
          }),
        };
      }
      return {};
    }),
    assignVerdict: assign({
      identity: ({ context, event: e }) =>
        e.type === "IDENTITY_VERDICT"
          ? { ...context.identity, status: "checking", tries: e.tries, rows: e.rows, score: e.score }
          : context.identity,
    }),
    assignMatched: enqueueActions(({ context, event: e, enqueue }) => {
      if (e.type !== "IDENTITY_VERDICT") return;
      enqueue.assign({
        identity: { ...context.identity, status: "matched", tries: e.tries, rows: e.rows, score: e.score },
      });
      enqueue.emit(event("identity.matched", { score: e.score ?? 0, tries: Math.max(1, e.tries) }));
    }),
    requestHelp: enqueueActions(({ context, enqueue }) => {
      if (context.identity.helpRequestedAt !== null) return;
      enqueue.assign({ identity: { ...context.identity, helpRequestedAt: context.now } });
      enqueue.emit(event("student.help_requested", { topic: "identity" }));
    }),
  },
  guards: {
    validJoinInput: ({ event: e }) => e.type === "JOIN" && isValidJoinInput(e.code, e.studentNumber),
    sessionEnded: ({ context }) => context.joined?.session.state === "ended",
    sessionFinal: ({ context }) =>
      context.joined?.session.state === "submitted" || context.joined?.session.state === "time_up",
    sessionWriting: ({ context }) =>
      context.joined?.session.state === "writing" || context.joined?.session.state === "paused",
    sessionInRules: ({ context }) =>
      context.joined?.session.state === "rules" || context.joined?.session.state === "ready",
    sessionInIdentity: ({ context }) =>
      context.joined?.session.state === "identity" && context.joined.exam.checks.identity,
    allChecksReady: ({ context }) => allChecksReady(context),
    identityRequired: ({ context }) => context.joined?.exam.checks.identity ?? true,
    identityMatched: ({ context }) => context.identity.status === "matched",
    canStart: ({ context }) =>
      context.agreed &&
      context.timer !== null &&
      (context.startRequested || context.now >= context.timer.startsAt),
    browserAwaitingLock: ({ context }) => mode(context) === "browser" && !context.exam.startedSent,
    hasQuestions: ({ context }) => mode(context) === "browser" || (context.questions?.length ?? 0) > 0,
    timeUp: ({ context, event: e }) =>
      e.type === "TICK" && context.timer !== null && isTimeUp(context.timer, e.now),
    syncEnded: ({ event: e }) => e.type === "SESSION_SYNC" && e.session.state === "ended",
    syncTimeUp: ({ event: e }) => e.type === "SESSION_SYNC" && e.session.state === "time_up",
    selfPauseOn: ({ context, event: e }) => e.type === "CUE_PAUSED" && e.on && mode(context) === "app",
    selfPauseOff: ({ event: e }) => e.type === "CUE_PAUSED" && !e.on,
    isCommand: ({ event: e }, params: { type: string }) =>
      e.type === "COMMAND" && e.command.type === params.type,
  },
}).createMachine({
  id: "flow",
  context: ({ input }) => ({
    locale: input.locale,
    device: input.device,
    contactEmail: input.contactEmail ?? null,
    form: { code: "", studentNumber: "", error: null },
    joined: null,
    questions: null,
    now: input.now,
    checks: INITIAL_CHECK_ROWS,
    rechecking: false,
    identity: INITIAL_IDENTITY,
    agreed: false,
    startRequested: false,
    exam: {
      index: 0,
      answers: {},
      lastSavedAt: null,
      questionsLoading: false,
      tabsClosed: null,
      startedSent: false,
    },
    timer: null,
    watch: { faces: null, away: false, phone: null, canResume: false },
    selfPause: null,
    proctorPause: null,
    notice: null,
    offline: null,
    log: [],
    finishing: null,
    receipt: null,
    ended: null,
    windowHidden: false,
    pairCode: null,
  }),
  initial: "boot",
  on: {
    TICK: { actions: assign({ now: ({ event: e }) => e.now }) },
    SET_DEVICE: { actions: assign({ device: ({ event: e }) => e.device }) },
    PAIR_CODE: { actions: assign({ pairCode: ({ event: e }) => e.code }) },
    RESTORE_ANSWERS: {
      actions: assign({
        exam: ({ context, event: e }) => {
          const answers = { ...context.exam.answers };
          let lastSavedAt = context.exam.lastSavedAt;
          for (const answer of e.answers) {
            const current = answers[answer.questionId];
            if (!current || current.savedAt < answer.savedAt) {
              answers[answer.questionId] = { choiceId: answer.choiceId, savedAt: answer.savedAt };
            }
            lastSavedAt = Math.max(lastSavedAt ?? 0, answer.savedAt);
          }
          return { ...context.exam, answers, lastSavedAt };
        },
      }),
    },
    SET_LOCALE: {
      actions: [
        assign({ locale: ({ event: e }) => e.locale }),
        emit(({ event: e }) => ({ type: "effect.locale", locale: e.locale }) as const),
      ],
    },
    CHECK_ROWS: {
      actions: assign({ checks: ({ context, event: e }) => ({ ...context.checks, ...e.rows }) }),
    },
    RECHECK_DONE: { actions: assign({ rechecking: false }) },
    DETECTION_STATE: {
      actions: assign({
        watch: ({ context, event: e }) => ({ ...context.watch, faces: e.faces, canResume: e.canResume }),
      }),
    },
    CUE_AWAY: { actions: assign({ watch: ({ context, event: e }) => ({ ...context.watch, away: e.on }) }) },
    SESSION_SYNC: {
      actions: assign({
        timer: ({ context, event: e }) =>
          context.timer ? syncTimer(context.timer, e.session, e.serverTime) : null,
      }),
    },
    CONNECTIVITY: {
      actions: assign(({ context, event: e }) => {
        if (!e.offline) return { offline: null };
        if (context.offline) return {};
        const since = e.since ?? context.now;
        const inExam = context.exam.startedSent;
        return {
          offline: { since },
          log: inExam ? logLine(context, { id: logId(), at: since, kind: "network_lost" }) : context.log,
        };
      }),
    },
    OPEN_CAMERA_SETTINGS: { actions: emit({ type: "effect.openCameraSettings" }) },
  },
  states: {
    boot: {
      on: {
        // Continue pressed while the saved join is still being read: this join wins.
        JOIN: {
          guard: "validJoinInput",
          target: "join.joining",
          actions: assign({
            form: ({ event: e }) => ({
              code: normalizeCode(e.code),
              studentNumber: e.studentNumber.trim(),
              error: null,
            }),
          }),
        },
      },
      invoke: {
        src: "restore",
        onDone: [
          {
            guard: ({ event: e }) => e.output !== null,
            target: "join.joining",
            actions: assign(({ event: e }) => {
              const saved = e.output as SavedJoin;
              return {
                form: { code: saved.code, studentNumber: saved.studentNumber, error: null },
                locale: saved.locale,
              };
            }),
          },
          { target: "join.form" },
        ],
        onError: { target: "join.form" },
      },
    },

    join: {
      initial: "form",
      states: {
        form: {
          on: {
            JOIN: [
              {
                guard: "validJoinInput",
                target: "joining",
                actions: assign({
                  form: ({ event: e }) => ({
                    code: normalizeCode(e.code),
                    studentNumber: e.studentNumber.trim(),
                    error: null,
                  }),
                }),
              },
              {
                actions: assign({
                  form: ({ event: e }) => ({
                    code: e.code,
                    studentNumber: e.studentNumber,
                    error: "invalid_input" as const,
                  }),
                }),
              },
            ],
          },
        },
        joining: {
          invoke: {
            src: "joinExam",
            input: ({ context }) => ({
              code: context.form.code,
              studentNumber: context.form.studentNumber,
              locale: context.locale,
            }),
            onDone: {
              target: "#flow.routeJoined",
              actions: [
                assign(({ context, event: e }) => {
                  const { questions, server_time, ...joined } = e.output;
                  const s = joined.session;
                  const writing = s.state === "writing" || s.state === "paused";
                  return {
                    joined,
                    questions: questions ?? context.questions,
                    timer: initialTimer({
                      startsAt: joined.exam.starts_at,
                      durationMin: joined.exam.duration_min,
                      extraMin: s.extra_min,
                      pausedS: s.paused_s,
                      serverTime: server_time,
                    }),
                    exam: { ...context.exam, startedSent: writing || context.exam.startedSent },
                    form: { ...context.form, error: null },
                  };
                }),
                emit(({ context, event: e }) => {
                  const { questions: _questions, ...output } = e.output;
                  return { type: "effect.joined", output, restored: context.exam.startedSent } as const;
                }),
              ],
            },
            onError: {
              target: "form",
              actions: assign({
                form: ({ context, event: e }) => ({ ...context.form, error: joinErrorOf(e.error) }),
              }),
            },
          },
        },
      },
    },

    routeJoined: {
      always: [
        { guard: "sessionEnded", target: "ending" },
        {
          guard: "sessionFinal",
          target: "submitting",
          actions: assign({
            finishing: ({ context }) =>
              context.joined?.session.state === "time_up" ? "time_up" : "submitted",
          }),
        },
        { guard: "sessionWriting", target: "exam" },
        { guard: "sessionInRules", target: "checkIn.rules" },
        { guard: "sessionInIdentity", target: "checkIn.identity" },
        { target: "checkIn.system" },
      ],
    },

    checkIn: {
      initial: "system",
      on: {
        COMMAND: [
          {
            guard: { type: "isCommand", params: { type: "start" } },
            actions: assign({ startRequested: true }),
          },
          { guard: { type: "isCommand", params: { type: "end" } }, target: "ending", actions: "assignEnded" },
          { guard: { type: "isCommand", params: { type: "message" } }, actions: "assignNotice" },
          { guard: { type: "isCommand", params: { type: "add_time" } }, actions: "assignNotice" },
        ],
        SESSION_SYNC: [
          { guard: "syncEnded", target: "ending", actions: ["assignSync", "assignEndedFromSync"] },
        ],
      },
      states: {
        system: {
          entry: assign({ checks: INITIAL_CHECK_ROWS, rechecking: false }),
          on: {
            CHECK_AGAIN: {
              actions: [assign({ rechecking: true }), emit({ type: "effect.systemCheck", action: "again" })],
            },
            CONTINUE: [
              {
                guard: ({ context }) =>
                  allChecksReady(context) && (context.joined?.exam.checks.identity ?? true),
                target: "identity",
              },
              { guard: "allChecksReady", target: "rules" },
            ],
          },
        },
        identity: {
          initial: "checking",
          entry: assign({
            identity: ({ context }) => ({
              ...INITIAL_IDENTITY,
              helpRequestedAt: context.identity.helpRequestedAt,
            }),
          }),
          on: {
            IDENTITY_STATUS: {
              actions: assign({
                identity: ({ context, event: e }) =>
                  context.identity.status === "matched"
                    ? context.identity
                    : { ...context.identity, status: e.status },
              }),
            },
          },
          states: {
            checking: {
              on: {
                IDENTITY_VERDICT: [
                  {
                    guard: ({ event: e }) => e.kind === "matched",
                    target: "matched",
                    actions: "assignMatched",
                  },
                  {
                    guard: ({ event: e }) => e.kind === "help",
                    target: "help",
                    actions: ["assignVerdict", "requestHelp"],
                  },
                  { actions: "assignVerdict" },
                ],
                ASK_PROCTOR: { target: "help", actions: "requestHelp" },
              },
            },
            help: {
              on: {
                IDENTITY_VERDICT: [
                  {
                    guard: ({ event: e }) => e.kind === "matched",
                    target: "matched",
                    actions: "assignMatched",
                  },
                  { actions: "assignVerdict" },
                ],
              },
            },
            matched: {
              on: { CONTINUE: { target: "#flow.checkIn.rules" } },
            },
          },
        },
        rules: {
          always: { guard: "canStart", target: "#flow.exam" },
          on: {
            SET_AGREED: { actions: assign({ agreed: ({ event: e }) => e.agreed }) },
          },
        },
      },
    },

    exam: {
      type: "parallel",
      entry: enqueueActions(({ context, enqueue }) => {
        const startedAt = context.now;
        const isApp = mode(context) === "app";
        if (isApp) enqueue.emit({ type: "effect.lockStart" });
        if (!context.exam.startedSent && isApp) {
          enqueue.emit(event("exam.started"));
          enqueue.assign({
            exam: { ...context.exam, startedSent: true },
            log: (
              [
                {
                  id: logId(),
                  at: startedAt,
                  kind: "on_screen",
                  faceMatched: context.identity.status === "matched",
                },
                { id: logId(), at: startedAt, kind: "exam_started", tabsClosed: context.exam.tabsClosed },
                ...context.log,
              ] satisfies LogEntry[]
            ).slice(0, LOG_CAP),
          });
        }
      }),
      on: {
        TICK: [
          {
            guard: "timeUp",
            target: "submitting",
            actions: [assign({ now: ({ event: e }) => e.now }), assign({ finishing: "time_up" })],
          },
          { actions: assign({ now: ({ event: e }) => e.now }) },
        ],
        SESSION_SYNC: [
          { guard: "syncEnded", target: "ending", actions: ["assignSync", "assignEndedFromSync"] },
          {
            guard: "syncTimeUp",
            target: "submitting",
            actions: ["assignSync", assign({ finishing: "time_up" })],
          },
          { actions: "assignSync" },
        ],
        CUE_PHONE: {
          actions: assign(({ context, event: e }) => {
            if (!e.on) return { watch: { ...context.watch, phone: null } };
            const score = e.score ?? context.watch.phone ?? 0;
            const fresh = context.watch.phone === null;
            return {
              watch: { ...context.watch, phone: score },
              log: fresh
                ? logLine(context, { id: logId(), at: context.now, kind: "phone", confidence: score })
                : context.log,
            };
          }),
        },
        RULE_EVENT: {
          guard: ({ event: e }) => e.eventType === "gaze.on_screen",
          actions: assign({
            log: ({ context }) =>
              logLine(context, { id: logId(), at: context.now, kind: "on_screen", faceMatched: false }),
          }),
        },
        LOCK_STARTED: {
          actions: assign(({ context, event: e }) => ({
            exam: { ...context.exam, tabsClosed: e.tabsClosed },
            log: context.log.map((line) =>
              line.kind === "exam_started" ? { ...line, tabsClosed: e.tabsClosed } : line,
            ),
          })),
        },
        LOCK_SUBMITTED: { target: "submitting", actions: assign({ finishing: "submitted" }) },
        COMMAND: [
          { guard: { type: "isCommand", params: { type: "end" } }, target: "ending", actions: "assignEnded" },
          { guard: { type: "isCommand", params: { type: "message" } }, actions: "assignNotice" },
          { guard: { type: "isCommand", params: { type: "add_time" } }, actions: "assignNotice" },
        ],
        ACK_NOTICE: { actions: assign({ notice: null }) },
      },
      states: {
        flow: {
          initial: "route",
          states: {
            route: {
              always: [{ guard: "browserAwaitingLock", target: "waitingLock" }, { target: "writing" }],
            },
            /** Browser exams: the window is in the tray until Üki Lock reports lock.started. */
            waitingLock: {
              on: {
                LOCK_STARTED: {
                  target: "writing",
                  actions: [
                    emit(event("exam.started")),
                    assign(({ context, event: e }) => ({
                      exam: { ...context.exam, startedSent: true, tabsClosed: e.tabsClosed },
                      log: [
                        {
                          id: logId(),
                          at: context.now,
                          kind: "exam_started" as const,
                          tabsClosed: e.tabsClosed,
                        },
                        ...context.log,
                      ].slice(0, LOG_CAP),
                    })),
                  ],
                },
              },
            },
            writing: {
              on: {
                SELECT_CHOICE: {
                  guard: ({ context, event: e }) =>
                    context.questions?.some(
                      (q) => q.id === e.questionId && q.choices.some((choice) => choice.id === e.choiceId),
                    ) ?? false,
                  actions: enqueueActions(({ context, event: e, enqueue }) => {
                    if (e.type !== "SELECT_CHOICE") return;
                    const savedAt = context.now;
                    const n = (context.questions?.findIndex((q) => q.id === e.questionId) ?? -1) + 1;
                    enqueue.assign({
                      exam: {
                        ...context.exam,
                        answers: {
                          ...context.exam.answers,
                          [e.questionId]: { choiceId: e.choiceId, savedAt },
                        },
                        lastSavedAt: savedAt,
                      },
                      log: logLine(context, { id: logId(), at: savedAt, kind: "question_saved", n }),
                    });
                    enqueue.emit({
                      type: "effect.answer",
                      questionId: e.questionId,
                      choiceId: e.choiceId,
                      savedAt,
                    });
                    enqueue.emit(event("answer.saved", { question_id: e.questionId }));
                  }),
                },
                NEXT_QUESTION: {
                  actions: assign({
                    exam: ({ context }) => ({
                      ...context.exam,
                      index: Math.min(
                        context.exam.index + 1,
                        Math.max(0, (context.questions?.length ?? 1) - 1),
                      ),
                    }),
                  }),
                },
                PREV_QUESTION: {
                  actions: assign({
                    exam: ({ context }) => ({ ...context.exam, index: Math.max(0, context.exam.index - 1) }),
                  }),
                },
                SUBMIT: { target: "#flow.submitting", actions: assign({ finishing: "submitted" }) },
                CUE_PAUSED: { guard: "selfPauseOn", target: "selfPaused" },
                COMMAND: {
                  guard: { type: "isCommand", params: { type: "pause" } },
                  target: "proctorPaused",
                  actions: assign(({ context, event: e }) => {
                    if (e.type !== "COMMAND" || e.command.type !== "pause") return {};
                    const since = Math.min(e.command.issuedAt, context.now);
                    return {
                      proctorPause: {
                        since,
                        byName: e.command.byName ?? context.joined?.proctor_name ?? null,
                        text: e.command.payload.text ?? null,
                      },
                      timer: context.timer ? startPause(context.timer, since, "proctor") : null,
                      log: logLine(context, {
                        id: logId(),
                        at: since,
                        kind: "proctor_paused",
                        proctorName: e.command.byName ?? context.joined?.proctor_name ?? null,
                      }),
                    };
                  }),
                },
              },
            },
            /** 2.3: no face (or the camera stopped) in an app exam; the rules engine sent session.paused. */
            selfPaused: {
              entry: assign(({ context, event: e }) => {
                const since = e.type === "CUE_PAUSED" ? Math.min(e.at, context.now) : context.now;
                const reason = e.type === "CUE_PAUSED" && e.reason ? e.reason : "face_missing";
                return {
                  selfPause: { reason, since },
                  timer: context.timer ? startPause(context.timer, since, "self") : null,
                  log: logLine(context, { id: logId(), at: since, kind: "no_face" }),
                };
              }),
              exit: assign(({ context }) => ({
                selfPause: null,
                timer: context.timer ? endPause(context.timer, context.now) : null,
              })),
              on: {
                IM_HERE: { actions: emit({ type: "effect.resume" }) },
                CUE_PAUSED: { guard: "selfPauseOff", target: "writing" },
              },
            },
            /** 2.1c: the proctor paused the session; only the resume command ends it. */
            proctorPaused: {
              exit: assign(({ context }) => ({
                proctorPause: null,
                timer: context.timer ? endPause(context.timer, context.now) : null,
              })),
              on: {
                COMMAND: { guard: { type: "isCommand", params: { type: "resume" } }, target: "writing" },
              },
            },
          },
        },
        questions: {
          initial: "check",
          states: {
            check: { always: [{ guard: "hasQuestions", target: "ready" }, { target: "loading" }] },
            loading: {
              entry: assign({ exam: ({ context }) => ({ ...context.exam, questionsLoading: true }) }),
              invoke: {
                src: "loadQuestions",
                input: ({ context }) => ({
                  code: context.form.code,
                  studentNumber: context.form.studentNumber,
                  locale: context.locale,
                }),
                onDone: {
                  target: "ready",
                  actions: assign({
                    questions: ({ event: e }) => [...e.output].sort((a, b) => a.position - b.position),
                    exam: ({ context }) => ({ ...context.exam, questionsLoading: false }),
                  }),
                },
                onError: { target: "check" },
              },
            },
            ready: {},
          },
        },
      },
    },

    /** Submit pressed, time up, or the Lock's exam.submitted: flush, submit_session, then 3.1. */
    submitting: {
      invoke: {
        src: "submit",
        input: ({ context }) => ({
          sessionId: context.joined?.session.id ?? "",
          reason: context.finishing ?? "submitted",
        }),
        onDone: [
          {
            guard: ({ event: e }) => e.output.state === "ended",
            target: "ended",
            actions: [
              assign(({ context, event: e }) => ({
                receipt: e.output,
                ended: context.ended ?? {
                  byName: context.joined?.proctor_name ?? null,
                  at: e.output.at,
                  reason: null,
                },
              })),
              emit({ type: "effect.finish", reason: "ended" }),
            ],
          },
          {
            target: "submitted",
            actions: [
              assign({ receipt: ({ event: e }) => e.output }),
              emit(
                ({ event: e }) =>
                  ({
                    type: "effect.finish",
                    reason: e.output.state === "time_up" ? "time_up" : "submitted",
                  }) as const,
              ),
            ],
          },
        ],
        // submit_session refused for good (the runtime retries anything retryable): back to the exam
        // so Submit can be pressed again, or to 1.1 when the exam never opened on this laptop.
        onError: [
          { guard: ({ context }) => context.exam.startedSent, target: "exam" },
          { target: "join.form" },
        ],
      },
    },

    /** The proctor ended the session: flush, submit_session for the receipt, 2.1d. */
    ending: {
      invoke: {
        src: "submit",
        input: ({ context }) => ({ sessionId: context.joined?.session.id ?? "", reason: "ended" as const }),
        onDone: {
          target: "ended",
          actions: [
            assign({ receipt: ({ event: e }) => e.output }),
            emit({ type: "effect.finish", reason: "ended" }),
          ],
        },
        // Refused for good: 2.1d without the receipt rather than a retry loop.
        onError: { target: "ended", actions: emit({ type: "effect.finish", reason: "ended" }) },
      },
    },

    submitted: {
      on: {
        SAVE_RECEIPT: { actions: emit({ type: "effect.saveReceipt" }) },
        CLOSE_APP: { actions: emit({ type: "effect.quit" }) },
      },
    },

    ended: {
      on: {
        SAVE_RECEIPT: { actions: emit({ type: "effect.saveReceipt" }) },
        CLOSE_APP: { actions: emit({ type: "effect.quit" }) },
      },
    },
  },
});

export function allChecksReady(context: FlowContext): boolean {
  const { checks } = context;
  const lockRequired = context.joined?.exam.checks.lock ?? true;
  return (
    checks.camera.status === "ready" &&
    checks.network.status === "ready" &&
    checks.apps.status === "ready" &&
    checks.screenShare.status === "ready" &&
    checks.storage.status === "ready" &&
    (!lockRequired || checks.lock === "paired")
  );
}

export type StudentFlowMachine = typeof studentFlowMachine;

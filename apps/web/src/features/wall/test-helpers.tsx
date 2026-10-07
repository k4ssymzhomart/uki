// Fixtures for the wall's tests: events, sessions, an initial render and an IntlProvider with the
// English dashboard messages. Imported only by *.test.ts(x) files.
import { cleanup, render } from "@testing-library/react";
import type { CompactEvent, EventType } from "@uki/contracts";
import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { afterEach } from "vitest";
import type { AnyClient } from "./queries.ts";
import type { SessionRow } from "./rows.ts";
import type { WallInitialData, WallStudent } from "./wall-store.ts";

export const EXAM_ID = "e0000000-0000-4000-8000-0000000000aa";
/** 10:47:10 in Asia/Almaty. */
export const NOW = Date.parse("2026-10-09T05:47:10.000Z");

export function iso(msFromNow: number): string {
  return new Date(NOW + msFromNow).toISOString();
}

export function sessionId(n: number): string {
  return `5e550000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function studentId(n: number): string {
  return `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

let counter = 0;
export function eventId(): string {
  counter += 1;
  return `01a10000-0000-7000-8000-${String(counter).padStart(12, "0")}`;
}

export function event(
  session: number,
  type: EventType,
  data: Record<string, unknown> = {},
  overrides: Partial<CompactEvent> = {},
): CompactEvent {
  return {
    id: eventId(),
    session_id: sessionId(session),
    exam_id: EXAM_ID,
    type,
    source: "app",
    review: "flag",
    at: iso(-60_000),
    received_at: iso(-59_000),
    data,
    frame_count: 0,
    ...overrides,
  };
}

export function sessionRow(n: number, overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: sessionId(n),
    student_id: studentId(n),
    state: "writing",
    status: { question: n },
    last_seen_at: iso(-5_000),
    joined_at: iso(-3_600_000),
    started_at: iso(-3_000_000),
    extra_min: 0,
    paused_s: 0,
    device: { os: "macos" },
    locale: "kk",
    ...overrides,
  };
}

export const NAMES = [
  "Madina Tulegenova",
  "Arman Bekzhanov",
  "Dias Kenzhebekov",
  "Aruzhan Kassymova",
  "Zhansaya Omarova",
  "Yerlan Tokhtarov",
];

export function student(n: number): WallStudent {
  return {
    id: studentId(n),
    fullName: NAMES[n - 1] ?? `Student Number${n}`,
    number: String(20231000 + n),
    seat: n * 2,
  };
}

export function initialData(
  sessions: SessionRow[] = [1, 2, 3].map((n) => sessionRow(n)),
  events: CompactEvent[] = [],
): WallInitialData {
  const students = sessions.map((s) => student(Number(s.id.slice(-12))));
  return {
    exam: {
      id: EXAM_ID,
      title: "Mathematics 2 · Midterm",
      startsAt: iso(-(90 * 60_000 - (42 * 60 + 17) * 1000)),
      durationMin: 90,
      status: "live",
      groups: ["204"],
      questionCount: 20,
    },
    students,
    sessions,
    events,
    staff: [{ id: "a5000000-0000-4000-8000-000000000001", fullName: "Aigerim Sadykova" }],
    serverNowMs: NOW,
  };
}

export function IntlProviders({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={BCP47.en}
      messages={loadMessages("en")}
      timeZone={TIME_ZONE}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export function renderIntl(ui: ReactElement) {
  return render(ui, { wrapper: IntlProviders });
}

/** Testing Library cleanup and the browser APIs Radix calls that jsdom lacks (as packages/ui/test/setup.ts). */
export function setupDom(): void {
  afterEach(() => cleanup());
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, writable: true });
  }
  const proto = Element.prototype as Element & {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
    setPointerCapture?: (id: number) => void;
    scrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void;
  };
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}

/**
 * A stand-in for the Supabase client: `from(table)` answers every PostgREST chain with that table's
 * rows, and `channel()` records the broadcast handlers so a test can play messages.
 */
export function fakeClient(rows: Record<string, unknown[]> = {}) {
  const handlers = new Map<string, (message: { payload: unknown }) => void>();
  let onStatus: ((status: string) => void) | null = null;
  const queries: string[] = [];
  const chain = (table: string): unknown => {
    const result = { data: rows[table] ?? [], error: null };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: typeof result) => void) => resolve(result);
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  const channel = {
    on(_type: string, filter: { event: string }, handler: (message: { payload: unknown }) => void) {
      handlers.set(filter.event, handler);
      return channel;
    },
    subscribe(callback: (status: string) => void) {
      onStatus = callback;
      return channel;
    },
  };
  const client = {
    from: (table: string) => {
      queries.push(table);
      return chain(table);
    },
    channel: () => channel,
    removeChannel: async () => "ok",
    realtime: { setAuth: async () => {} },
  };
  return {
    client: client as unknown as AnyClient,
    rows,
    queries,
    broadcast: (event: string, payload: unknown) => handlers.get(event)?.({ payload }),
    status: (status: string) => onStatus?.(status),
    subscribed: () => onStatus !== null,
  };
}

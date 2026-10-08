"use client";

import type { CompactEvent } from "@uki/contracts";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { StaffContext } from "../../../features/shell/staff-context.ts";
import { LiveWall } from "../../../features/wall/live-wall.tsx";
import type { AnyClient } from "../../../features/wall/queries.ts";
import type { WallInitialData } from "../../../features/wall/wall-store.ts";

const EXAM_ID = "0192a6e0-0000-7000-8000-00000000e000";
const NAMES = [
  "Aruzhan Abenova",
  "Nursultan Zhaksybekov",
  "Dariga Seitkali",
  "Yerlan Mukanov",
  "Zhanel Omarova",
  "Alikhan Kassymov",
  "Kamila Iskakova",
  "Temirlan Nurlanov",
  "Ainur Sarsenova",
  "Daniyar Zhumabayev",
  "Togzhan Utegenova",
  "Asylbek Baimukhanov",
];

const hex = (n: number, width = 12) => n.toString(16).padStart(width, "0");

/** A client that answers every read with no rows, every channel with silence, and demo_live_seen. */
function fixtureClient(startsAt: string): AnyClient {
  const result = { data: [], error: null };
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: (value: typeof result) => void) => resolve(result);
        return () => chain;
      },
    },
  );
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    from: () => chain,
    channel: () => channel,
    removeChannel: async () => "ok",
    realtime: { setAuth: async () => {} },
    rpc: async () => ({ data: { starts_at: startsAt, duration_min: 720, status: "live" }, error: null }),
  } as unknown as AnyClient;
}

function fixture(nowMs: number, stopped: boolean): WallInitialData {
  const iso = (ms: number) => new Date(nowMs + ms).toISOString();
  const startsAt = iso(-3 * 3_600_000);
  const sessions = NAMES.map((_, i) => ({
    id: `0192a6e0-0000-7000-8000-${hex(0xb000 + i)}`,
    student_id: `0192a6e0-0000-7000-8000-${hex(0xa000 + i)}`,
    state: i === 8 ? ("paused" as const) : ("writing" as const),
    status: { question: (i % 20) + 1 },
    last_seen_at: iso(stopped ? -240_000 - i * 1000 : -3_000 - i * 700),
    joined_at: iso(-3 * 3_600_000 + 60_000),
    started_at: iso(-3 * 3_600_000 + 120_000),
    extra_min: 0,
    paused_s: 0,
    device: { os: "windows" as const, app_version: "0.1.0-judge-sim", simulated: true },
    locale: "kk" as const,
  }));
  const flag = (
    i: number,
    type: CompactEvent["type"],
    data: Record<string, unknown>,
    agoMs: number,
  ): CompactEvent => ({
    id: `0192a6e0-0000-7000-8000-${hex(0xe000 + i)}`,
    session_id: sessions[i]?.id as string,
    exam_id: EXAM_ID,
    type,
    source: "app",
    review: "flag",
    at: iso(-agoMs),
    received_at: iso(-agoMs + 400),
    data,
    frame_count: 1,
  });
  return {
    exam: {
      id: EXAM_ID,
      title: "Demo · Live",
      startsAt,
      durationMin: 720,
      status: "live",
      groups: ["DEMO"],
      questionCount: 20,
    },
    students: NAMES.map((fullName, i) => ({
      id: sessions[i]?.student_id as string,
      fullName,
      number: String(20249001 + i),
      seat: i + 1,
    })),
    sessions,
    events: [
      flag(2, "phone.detected", { score: 0.97, held_ms: 2600 }, 40_000),
      flag(5, "face.second", { duration_ms: 3200, faces: 2 }, 95_000),
      flag(10, "gaze.down", { duration_ms: 6100 }, 20_000),
    ],
    staff: [],
    decisions: [],
    serverNowMs: nowMs,
  };
}

export function DemoLiveFixture() {
  const stopped = useSearchParams().get("stopped") === "1";
  // The fixture is made from the browser's clock after hydration, so the server render has nothing to differ.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);
  const data = useMemo(() => (nowMs === null ? null : fixture(nowMs, stopped)), [nowMs, stopped]);
  const client = useMemo(() => (data === null ? null : fixtureClient(data.exam.startsAt)), [data]);
  if (data === null || client === null) return null;
  return (
    <StaffContext
      value={{
        initials: "HJ",
        fullName: "Hackathon Judge",
        email: "judge@kru.test",
        role: "observer",
        workspaceName: "KRU · Kostanay",
        facultyName: null,
      }}
    >
      <div className="flex min-h-screen">
        <LiveWall
          initial={data}
          getClient={() => client}
          measureOffset={async () => 0}
          demoLive={{ examId: EXAM_ID, startsAt: data.exam.startsAt }}
        />
      </div>
    </StaffContext>
  );
}

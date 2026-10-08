// Judge mode: the simulator indicator on the DEMO-LIVE wall renders in Russian and in English with no
// missing key, shows live or stopped from the newest last_seen_at, appears on DEMO-LIVE only, marks the
// wall as open through demo_live_seen, and reloads after a rollover.
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulatorIndicator } from "../src/features/judge/simulator-indicator.tsx";
import { LiveWall } from "../src/features/wall/live-wall.tsx";
import type { AnyClient } from "../src/features/wall/queries.ts";
import {
  EXAM_ID,
  fakeClient,
  initialData,
  iso,
  NOW,
  sessionRow,
  setupDom,
} from "../src/features/wall/test-helpers.tsx";
import { WallStoreProvider } from "../src/features/wall/wall-store-context.tsx";
import { DANA, intlErrors, rawKeys, renderWithIntl } from "./render.tsx";

setupDom();

const OBSERVER = { ...DANA, role: "observer" as const, fullName: "Judge", initials: "J" };
const STARTS_AT = "2026-10-09T05:00:00.000Z";

function clientWith(seen: unknown, calls: unknown[] = []): AnyClient {
  const db = fakeClient();
  return {
    ...(db.client as object),
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: seen, error: null };
    },
  } as unknown as AnyClient;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the simulator indicator (judge mode)", () => {
  it("renders on the DEMO-LIVE wall in Russian with no missing key", async () => {
    const calls: unknown[] = [];
    const client = clientWith({ starts_at: STARTS_AT, duration_min: 720, status: "live" }, calls);
    const { container } = renderWithIntl(
      <LiveWall
        initial={initialData([
          sessionRow(1, { last_seen_at: iso(-5_000) }),
          sessionRow(2, { last_seen_at: iso(-90_000) }),
        ])}
        getClient={() => client}
        measureOffset={async () => 0}
        demoLive={{ examId: EXAM_ID, startsAt: STARTS_AT }}
      />,
      OBSERVER,
      "ru",
    );
    expect(await screen.findByText("Симулятор: работает · сигнал 5 с назад")).toBeTruthy();
    await waitFor(() => expect(calls).toEqual([{ name: "demo_live_seen", args: { exam_id: EXAM_ID } }]));
    expect(intlErrors).toEqual([]);
    expect(rawKeys(container)).toEqual([]);
  });

  it("says stopped in English once no session was seen for over a minute", async () => {
    renderWithIntl(
      <LiveWall
        initial={initialData([sessionRow(1, { last_seen_at: iso(-180_000) })])}
        getClient={() => clientWith({ starts_at: STARTS_AT, duration_min: 720, status: "live" })}
        measureOffset={async () => 0}
        demoLive={{ examId: EXAM_ID, startsAt: STARTS_AT }}
      />,
      OBSERVER,
    );
    expect(await screen.findByText("Simulator: stopped · last seen 3 min ago")).toBeTruthy();
    expect(intlErrors).toEqual([]);
  });

  it("says stopped and never seen in Russian without any session", async () => {
    renderWithIntl(
      <LiveWall
        initial={initialData([])}
        getClient={() => clientWith({ starts_at: STARTS_AT, duration_min: 720, status: "live" })}
        measureOffset={async () => 0}
        demoLive={{ examId: EXAM_ID, startsAt: STARTS_AT }}
      />,
      OBSERVER,
      "ru",
    );
    expect(await screen.findByText("Симулятор: остановлен · сигнала ещё не было")).toBeTruthy();
    expect(intlErrors).toEqual([]);
  });

  it("is not on any other exam's wall", async () => {
    const calls: unknown[] = [];
    renderWithIntl(
      <LiveWall
        initial={initialData()}
        getClient={() => clientWith(null, calls)}
        measureOffset={async () => 0}
      />,
      { ...DANA, role: "proctor" },
    );
    await screen.findByText("Live wall");
    expect(screen.queryByText(/Simulator:/)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("reloads the wall when DEMO-LIVE was rolled over", async () => {
    const onRollover = vi.fn();
    renderWithIntl(
      <WallStoreProvider initial={initialData()} nowMs={NOW}>
        <SimulatorIndicator
          examId={EXAM_ID}
          startsAt={STARTS_AT}
          client={clientWith({ starts_at: "2026-10-09T17:30:00+00:00", duration_min: 720, status: "live" })}
          onRollover={onRollover}
        />
      </WallStoreProvider>,
      OBSERVER,
    );
    await waitFor(() => expect(onRollover).toHaveBeenCalledTimes(1));
  });
});

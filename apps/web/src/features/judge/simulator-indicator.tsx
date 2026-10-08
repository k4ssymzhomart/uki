"use client";

// Judge mode on the DEMO-LIVE wall: "Simulator: live · last seen 4 s ago" (or stopped), from the newest
// last_seen_at among the exam's sessions in the wall's store. While the page is visible it also tells
// the database the wall is open (demo_live_seen, every 30 s), so the simulator plays at full cadence,
// and reloads the page when the exam was rolled over (its starts_at moved).
import { DEMO_LIVE_SEEN_EVERY_MS, DemoLiveSeenOutput } from "@uki/contracts";
import { Chip } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { AnyClient } from "../wall/queries.ts";
import { useWallWith } from "../wall/wall-store-context.tsx";
import { agoParts, rolledOver, type SimulatorStatus, simulatorStatus } from "./judge-model.ts";

function sameStatus(a: SimulatorStatus, b: SimulatorStatus): boolean {
  const seconds = (status: SimulatorStatus) =>
    status.agoMs === null ? null : Math.floor(status.agoMs / 1000);
  return a.live === b.live && seconds(a) === seconds(b);
}

export interface SimulatorIndicatorProps {
  examId: string;
  /** The exam's starts_at when the page was rendered. */
  startsAt: string;
  /** Null until the browser client exists (after hydration). */
  client: AnyClient | null;
  /** Tests pass a spy; the app reloads the page. */
  onRollover?: () => void;
}

export function SimulatorIndicator({ examId, startsAt, client, onRollover }: SimulatorIndicatorProps) {
  const t = useTranslations("dashboard.judge.simulator");
  const status = useWallWith(
    (state) =>
      simulatorStatus(
        Object.values(state.sessions).map((session) => session.lastSeenAt),
        state.nowMs,
      ),
    sameStatus,
  );

  useEffect(() => {
    if (client === null) return;
    let stopped = false;
    const seen = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const { data, error } = await client.rpc("demo_live_seen", { exam_id: examId });
      if (stopped || error) return;
      const parsed = DemoLiveSeenOutput.safeParse(data);
      if (parsed.success && rolledOver(startsAt, parsed.data.starts_at)) {
        (onRollover ?? (() => window.location.reload()))();
      }
    };
    void seen();
    const id = window.setInterval(() => void seen(), DEMO_LIVE_SEEN_EVERY_MS);
    const onVisible = () => void seen();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, examId, startsAt, onRollover]);

  let text: string;
  if (status.agoMs === null) {
    text = t("never");
  } else {
    const { unit, count } = agoParts(status.agoMs);
    const ago = t(unit, { count });
    text = status.live ? t("live", { ago }) : t("stopped", { ago });
  }
  return (
    <div className="flex justify-end">
      <Chip status={status.live ? "ok" : "flag"} title={t("label")}>
        {text}
      </Chip>
    </div>
  );
}

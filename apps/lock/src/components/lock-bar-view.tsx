import { LockBar } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { BarState } from "../lib/state.ts";
import { formatTimeLeft } from "../lib/time-left.ts";
import { useTimeLeft } from "../lib/time-left-hook.ts";
import { useNow } from "../lib/use-now.ts";

export interface LockBarViewProps {
  bar: BarState;
  className?: string;
  /** The Exam portal tab; the block page uses it to go back to the exam. */
  onPortal?: () => void;
  /** Phase 1, E.5a: Ask proctor in the bar (browser exams on the portal); hidden without it. */
  onAskProctor?: () => void;
  /** The Ask proctor sheet is open: the button shows lime. */
  askProctorActive?: boolean;
}

/**
 * The Lock bar during an exam in the browser (Figma Ext/Lock bar 90:2549 on E.5, E.6, E.7). Phase 0 shows
 * only the portal tab; Phase 1 adds Ask proctor (E.5a) on the exam portal. The watch label follows the
 * app: "Phone found" while its phone warning is up.
 */
export function LockBarView({ bar, className, onPortal, onAskProctor, askProctorActive }: LockBarViewProps) {
  const t = useTranslations();
  const left = useTimeLeft(bar, useNow());
  return (
    <LockBar
      badge={t("lock.badge")}
      exam={bar.title}
      tabs={[{ id: "portal", icon: "globe", label: t("lock.tab.portal"), active: true, onSelect: onPortal }]}
      watching={bar.watch === "phone_found" ? t("exam.phone.title") : t("lock.watching")}
      time={formatTimeLeft(left)}
      timeLabel={t("exam.timer.left")}
      askProctorLabel={t("action.ask_proctor")}
      onAskProctor={bar.mode === "browser" ? onAskProctor : undefined}
      askProctorActive={askProctorActive}
      className={className}
    />
  );
}

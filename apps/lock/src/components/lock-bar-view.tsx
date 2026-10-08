import { effectiveBrowserRules } from "@uki/contracts";
import { LockBar, type LockBarTab } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { BarState } from "../lib/state.ts";
import { formatTimeLeft } from "../lib/time-left.ts";
import { useTimeLeft } from "../lib/time-left-hook.ts";
import { useNow } from "../lib/use-now.ts";

/** What the page under the bar shows: the exam portal, or E.5b's calculator. */
export type BarView = "portal" | "calculator";

export interface LockBarViewProps {
  bar: BarState;
  className?: string;
  /** The tab the student is on; the portal unless the calculator is open. */
  view?: BarView;
  /** The Exam portal tab: back to the exam (the block page), or closes the calculator. */
  onPortal?: () => void;
  /** Phase 1, E.5b: the Calculator tab, shown in browser exams when browser_rules.calculator is on. */
  onCalculator?: () => void;
  /** Phase 1, E.5a: Ask proctor in the bar (browser exams on the portal); hidden without it. */
  onAskProctor?: () => void;
  /** The Ask proctor sheet is open: the button shows lime. */
  askProctorActive?: boolean;
}

/** Whether the bar shows the Calculator tab: a browser exam whose rules keep the calculator on (E.1). */
export function hasCalculator(bar: BarState): boolean {
  return bar.mode === "browser" && effectiveBrowserRules(bar.browser_rules).calculator;
}

/**
 * The Lock bar during an exam in the browser (Figma Ext/Lock bar 90:2549 on E.5, E.5b, E.6, E.7). The tabs
 * are the exam portal and, when the exam's rules allow it, the calculator (E.5b); Phase 1 also adds Ask
 * proctor (E.5a) on the exam portal. The watch label follows the app: "Phone found" while its phone warning
 * is up.
 */
export function LockBarView({
  bar,
  className,
  view = "portal",
  onPortal,
  onCalculator,
  onAskProctor,
  askProctorActive,
}: LockBarViewProps) {
  const t = useTranslations();
  const left = useTimeLeft(bar, useNow());
  const calculator = view === "calculator";
  const tabs: LockBarTab[] = [
    { id: "portal", icon: "globe", label: t("lock.tab.portal"), active: !calculator, onSelect: onPortal },
  ];
  if (onCalculator && hasCalculator(bar))
    tabs.push({
      id: "calculator",
      icon: "calculator",
      label: t("lock.tab.calculator"),
      active: calculator,
      onSelect: onCalculator,
    });
  return (
    <LockBar
      badge={t("lock.badge")}
      exam={bar.title}
      tabs={tabs}
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

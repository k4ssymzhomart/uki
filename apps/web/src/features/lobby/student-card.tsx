"use client";

import { initials, StudentPopover } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import {
  cardTriesMeta,
  checkInProgress,
  type LobbyRow,
  problemFact,
  stuckOnIdentity,
} from "./lobby-model.ts";
import type { HoverCard } from "./use-hover-card.ts";

export type StudentCardProps = {
  row: LobbyRow;
  card: HoverCard;
  /** Message on the card: the free-text message to this student (2.4b's Write a message). */
  onMessage: (row: LobbyRow) => void;
  /** Identity help on the card of a student held by the card check: opens 1.5b. */
  onIdentityHelp: (row: LobbyRow) => void;
};

/**
 * Where 1.5a (Figma 85:6412) sits against its row: the frame draws the card's corner 21 px right of the
 * row's left edge and 5 px under the avatar; from the name it is 27 px left and 22 px down.
 */
const ALIGN_OFFSET = -27;
const SIDE_OFFSET = 22;

/**
 * 1.5a Student card: the student's name in a lobby row opens Popover/Student (77:2318) when the pointer
 * rests on the row, or on click, Enter or Space. It shows the chip, the check-in step with its bar,
 * the problem and the device from `sessions`, and Message; for a student held by the card check,
 * Identity help (1.5b) takes Verify by hand's place, which has no plan behaviour (decisions).
 */
export function StudentCard({ row, card, onMessage, onIdentityHelp }: StudentCardProps) {
  const t = useTranslations("dashboard.lobby");
  const common = useTranslations("dashboard.common");
  const locale = useDashboardLocale();
  if (row.state === null) return <>{row.name}</>;

  const progress = checkInProgress(row.state, row.problem);
  const tries = cardTriesMeta(row.problem);
  const problem = problemFact(row.problem);
  const open = card.openId === row.studentId;
  const meta = row.group
    ? common("withDetail", { main: row.number, detail: common("groups", { count: 1, codes: row.group }) })
    : row.number;
  const device = row.device
    ? t("device", { os: t(`os.${row.device.os}`), version: row.device.version })
    : t("noDevice");

  return (
    <StudentPopover
      open={open}
      onOpenChange={(next) => card.setOpen(row.studentId, next)}
      sideOffset={SIDE_OFFSET}
      alignOffset={ALIGN_OFFSET}
      onOpenAutoFocus={(event) => {
        if (card.byHover) event.preventDefault();
      }}
      trigger={
        <button
          type="button"
          onClick={(event) => {
            // A card the pointer opened stays open when its name is clicked, rather than closing.
            if (open && card.byHover) {
              event.preventDefault();
              card.setOpen(row.studentId, true);
            }
          }}
          className="cursor-pointer rounded-sm text-left outline-none hover:underline focus-visible:shadow-focus"
        >
          {row.name}
        </button>
      }
      className="z-50"
      data-student-card={row.studentId}
      {...card.cardHandlers}
      initials={initials(row.name, locale)}
      name={row.name}
      meta={meta}
      status={
        row.category === "needHelp"
          ? { status: "warn", label: t("card.help") }
          : { status: row.chip.status, label: t(`chip.${row.chip.key}`) }
      }
      step={t("card.step", { step: progress.step, total: progress.steps.length })}
      stepMeta={
        tries === null
          ? undefined
          : tries.key === "retry"
            ? t("card.retry", { attempt: tries.attempt, max: tries.max })
            : t("card.tries", { tries: tries.tries, max: tries.max })
      }
      steps={progress.steps.map((step) => ({
        id: step.id,
        label: t(`card.stepName.${step.id}`),
        state: step.state,
      }))}
      facts={[
        ...(problem
          ? [
              {
                id: "problem",
                label: t("card.problem"),
                value:
                  problem.key === "appOpen"
                    ? t("detail.appOpen", { app: problem.app })
                    : problem.key === "cameraBlocked"
                      ? t("detail.cameraBlocked")
                      : t("card.cardUnreadable"),
              },
            ]
          : []),
        { id: "device", label: t("card.device"), value: device },
      ]}
      secondaryAction={
        row.category === "done"
          ? undefined
          : {
              label: t("message"),
              onClick: () => {
                card.setOpen(row.studentId, false);
                onMessage(row);
              },
            }
      }
      primaryAction={
        stuckOnIdentity(row)
          ? {
              label: t("identityHelp.open"),
              onClick: () => {
                card.setOpen(row.studentId, false);
                onIdentityHelp(row);
              },
            }
          : undefined
      }
    />
  );
}

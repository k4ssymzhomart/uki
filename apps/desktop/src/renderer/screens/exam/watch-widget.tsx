import { Face, LiveWidget, type LiveWidgetState } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { WatchModel } from "../../flow/view-model.ts";
import { formatElapsed } from "../shared/format.ts";

const WIDGET_STATE: Record<Exclude<WatchModel["state"], "offline">, LiveWidgetState> = {
  watching: "watching",
  away: "looked-away",
  phone: "phone",
  paused: "paused",
  proctor_paused: "paused",
};

/**
 * Widget/Live beside the exam (Figma 15:1264). Offline (2.1a) has no state in the UI kit's LiveWidget,
 * so it is drawn here with the same parts: the oops face and a warn dot, full width as in the frame.
 */
export function WatchWidget({ watch }: { watch: WatchModel }) {
  const t = useTranslations();
  const elapsed = formatElapsed(watch.elapsedMs);

  if (watch.state === "offline") {
    return (
      <div
        data-widget-state="offline"
        className="flex w-full shrink-0 items-center gap-3.5 rounded-pill border border-line-default bg-surface py-3 pr-5 pl-3 text-fg-primary shadow-float"
      >
        <Face state="oops" className="size-12" />
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="type-card-title" aria-live="polite">
            {t("exam.offline.status_title")}
          </span>
          <span className="type-mono-s">{t("exam.offline.status", { elapsed })}</span>
        </div>
        <span aria-hidden="true" className="ml-2 size-2.5 shrink-0 rounded-pill bg-warn" />
      </div>
    );
  }

  let title: string;
  let detail: string;
  switch (watch.state) {
    case "phone":
      title = t("exam.phone.title");
      detail = t("exam.phone.status", { confidence: watch.phoneScore ?? 0 });
      break;
    case "paused":
      title = t("exam.paused.status_title");
      detail = t("exam.paused.status");
      break;
    case "proctor_paused":
      title = t("exam.proctor_paused.status_title");
      detail = t("exam.proctor_paused.status", { elapsed });
      break;
    default:
      title = t("exam.watch.title");
      detail = t("exam.watch.status", { elapsed });
  }
  // Under 1280 px the panel is 320 wide: let the two lines wrap instead of pushing the dot out.
  return (
    <LiveWidget
      state={WIDGET_STATE[watch.state]}
      title={title}
      detail={detail}
      className="max-w-full shrink-0 [&>div]:min-w-0 [&>div]:whitespace-normal"
    />
  );
}

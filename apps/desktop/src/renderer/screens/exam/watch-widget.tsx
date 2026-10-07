import { LiveWidget, type LiveWidgetState } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { WatchModel } from "../../flow/view-model.ts";
import { formatElapsed } from "../shared/format.ts";

const WIDGET_STATE: Record<WatchModel["state"], LiveWidgetState> = {
  watching: "watching",
  away: "looked-away",
  phone: "phone",
  paused: "paused",
  proctor_paused: "paused",
  offline: "offline",
};

/**
 * Widget/Live beside the exam (Figma 15:1264); 2.1a's offline widget is the kit's offline state, full
 * width as in the frame. Under 1280 px the panel is 320 wide and the kit wraps the two lines.
 */
export function WatchWidget({ watch }: { watch: WatchModel }) {
  const t = useTranslations();
  const elapsed = formatElapsed(watch.elapsedMs);

  let title: string;
  let detail: string;
  switch (watch.state) {
    case "offline":
      title = t("exam.offline.status_title");
      detail = t("exam.offline.status", { elapsed });
      break;
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
  return (
    <LiveWidget
      state={WIDGET_STATE[watch.state]}
      title={title}
      detail={detail}
      className={watch.state === "offline" ? "w-full shrink-0" : "max-w-full shrink-0"}
    />
  );
}

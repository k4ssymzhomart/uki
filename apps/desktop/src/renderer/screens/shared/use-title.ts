import type { Messages } from "@uki/i18n";
import { useMessages, useTranslations } from "use-intl";
import type { TitleBarModel } from "../../flow/view-model.ts";

type ExamTypeKey = keyof Messages["exam"]["type"];

function isExamTypeKey(types: Record<string, unknown>, key: string): key is ExamTypeKey {
  return Object.hasOwn(types, key);
}

/**
 * The window title (App/Title bar): "Üki · Mathematics 2 · Midterm" and its variants, or the bare
 * product name before a join (1.1, app.name). Offline says "browser locked" only when Üki Lock has
 * locked the browser (`browserLocked`); an exam without the Lock gets app.title.offline_unlocked.
 */
export function useTitle(model: TitleBarModel, options: { browserLocked?: boolean } = {}): string {
  const t = useTranslations();
  const messages = useMessages();
  if (model.exam === null) return t("app.name");
  const kind = model.exam.kind.trim().toLowerCase();
  const examType = isExamTypeKey(messages.exam.type, kind) ? t(`exam.type.${kind}`) : model.exam.kind;
  const values = { course: model.exam.course, examType };
  switch (model.variant) {
    case "locked":
      return t("app.title.locked", values);
    case "offline":
      return options.browserLocked ? t("app.title.offline", values) : t("app.title.offline_unlocked", values);
    case "proctor_paused":
      return t("app.title.proctor_paused", values);
    case "ended":
      return t("app.title.ended", values);
    case "submitted":
      return t("app.title.submitted", values);
    default:
      return t("app.title.default", values);
  }
}

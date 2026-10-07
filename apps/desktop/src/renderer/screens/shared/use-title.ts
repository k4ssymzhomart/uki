import type { Messages } from "@uki/i18n";
import { useMessages, useTranslations } from "use-intl";
import type { TitleBarModel } from "../../flow/view-model.ts";

type ExamTypeKey = keyof Messages["exam"]["type"];

function isExamTypeKey(types: Record<string, unknown>, key: string): key is ExamTypeKey {
  return Object.hasOwn(types, key);
}

/**
 * The window title (App/Title bar): "Üki · Mathematics 2 · Midterm" and its variants. Null before a
 * join; the catalog has no key for the bare product name 1.1 shows.
 */
export function useTitle(model: TitleBarModel): string | null {
  const t = useTranslations();
  const messages = useMessages();
  if (model.exam === null) return null;
  const kind = model.exam.kind.trim().toLowerCase();
  const examType = isExamTypeKey(messages.exam.type, kind) ? t(`exam.type.${kind}`) : model.exam.kind;
  const values = { course: model.exam.course, examType };
  switch (model.variant) {
    case "locked":
      return t("app.title.locked", values);
    case "offline":
      return t("app.title.offline", values);
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

import { useT } from "../portal/i18n.tsx";

/** Breadcrumb and quiz title (Figma E.4 and E.9). */
export function QuizHeading() {
  const t = useT();
  return (
    <>
      <p className="type-ui-caption whitespace-pre opacity-55">{t("breadcrumb")}</p>
      <h1 className="type-h3">{t("quizTitle")}</h1>
    </>
  );
}

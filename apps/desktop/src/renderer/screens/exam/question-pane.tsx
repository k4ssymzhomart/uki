import { formatTime, type Locale } from "@uki/i18n";
import { Banner, Button, RadioGroup, RadioOption, Spinner } from "@uki/ui";
import { useId } from "react";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";
import { share } from "../shared/format.ts";
import { NoticeBanners } from "./notice-banners.tsx";

export type QuestionPaneProps = {
  model: ExamModel;
  locale: Locale;
  /** A pause card covers the pane: keep it out of focus and the accessibility tree. */
  inert: boolean;
  onSelectChoice: (questionId: string, choiceId: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onGotIt: () => void;
  /** Check again on the questions error banner. */
  onRetryQuestions: () => void;
};

/**
 * The question column of 2.1 (Figma 51:2074): banners, "Question 7 of 20" with its progress, the
 * question, its choices as Radio options and the footer. Ask proctor stays hidden in Phase 0. When the
 * questions do not load, the Error banner (Banner 145:2753, which carries the retry action) joins the
 * 2.1a and 2.1e banners in place of the spinner; no frame draws this state.
 */
export function QuestionPane({
  model,
  locale,
  inert,
  onSelectChoice,
  onNext,
  onBack,
  onSubmit,
  onGotIt,
  onRetryQuestions,
}: QuestionPaneProps) {
  const t = useTranslations();
  const headingId = useId();
  const { question } = model;

  let saved: string | null = null;
  if (model.savedAt !== null) {
    const time = formatTime(model.savedAt, locale, { seconds: true });
    saved = model.savedOffline ? t("exam.saved_offline", { time }) : t("exam.saved", { time });
  }

  return (
    <div
      inert={inert}
      className="flex h-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto pt-12 pr-14 pb-9 pl-16"
    >
      <NoticeBanners notice={model.notice} offline={model.offline} locale={locale} onGotIt={onGotIt} />
      {question === null && model.questionsFailed ? (
        <Banner
          kind="error"
          title={t("exam.questions.failed")}
          className="shrink-0"
          action={
            <Button variant="secondary" loading={model.questionsLoading} onClick={onRetryQuestions}>
              {t("check.again")}
            </Button>
          }
        />
      ) : null}
      {question === null ? (
        model.questionsLoading && !model.questionsFailed ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : null
      ) : (
        <>
          <p className="shrink-0 whitespace-nowrap opacity-58 type-mono-overline">
            {t("exam.counter", { n: question.n, total: question.total })}
          </p>
          <div
            aria-hidden="true"
            className="h-1 w-150 max-w-full shrink-0 overflow-clip rounded-pill bg-subtle"
          >
            <div
              className="h-full rounded-pill bg-brand"
              style={{ width: `${share(question.n, question.total) * 100}%` }}
            />
          </div>
          <div aria-hidden="true" className="h-2 shrink-0" />
          <h1 id={headingId} className="shrink-0 type-h3">
            {question.body}
          </h1>
          <div aria-hidden="true" className="h-1 shrink-0" />
          <RadioGroup
            aria-labelledby={headingId}
            value={question.selectedChoiceId ?? ""}
            onValueChange={(choiceId) => onSelectChoice(question.id, choiceId)}
            disabled={model.submitting}
            className="shrink-0 gap-4"
          >
            {question.choices.map((choice) => (
              <RadioOption
                key={choice.id}
                value={choice.id}
                title={choice.body}
                detail={t("exam.option", { letter: choice.letter })}
              />
            ))}
          </RadioGroup>
        </>
      )}
      <div aria-hidden="true" className="min-h-2 flex-1" />
      <div className="flex w-full shrink-0 items-center gap-3 overflow-clip">
        <p className="min-w-0 flex-1 opacity-50 type-card-caption">{saved}</p>
        <Button variant="ghost" disabled={!model.canGoBack || model.submitting} onClick={onBack}>
          {t("exam.back")}
        </Button>
        {model.isLast ? (
          <Button loading={model.submitting} disabled={question === null} onClick={onSubmit}>
            {t("exam.submit")}
          </Button>
        ) : (
          <Button disabled={question === null} onClick={onNext}>
            {t("exam.next")}
          </Button>
        )}
      </div>
    </div>
  );
}

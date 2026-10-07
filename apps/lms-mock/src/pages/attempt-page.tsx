import { Button, cn, RadioGroup, RadioOption } from "@uki/ui";
import { useState } from "react";
import { PortalHeader } from "../components/portal-header.tsx";
import { portalTime, usePortalLocale, useT } from "../portal/i18n.tsx";
import {
  type Attempt,
  answer,
  answeredCount,
  finish,
  loadAttempt,
  newAttempt,
  OPTION_LETTERS,
  QUESTIONS,
  saveAttempt,
} from "../portal/quiz.ts";
import { navigate } from "../router/history.ts";
import { ROUTES } from "../router/routes.ts";

/** The attempt (E.5, portal part): quiz navigation on the left, one question at a time on the right. */
export function AttemptPage() {
  const t = useT();
  const locale = usePortalLocale();
  const [attempt, setAttempt] = useState<Attempt>(
    () => loadAttempt(window.sessionStorage) ?? newAttempt(Date.now()),
  );
  const [index, setIndex] = useState(() => {
    const firstOpen = QUESTIONS.findIndex((q) => attempt.answers[q.id] === undefined);
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const question = QUESTIONS[index] ?? QUESTIONS[0];
  if (!question) return null;
  const total = QUESTIONS.length;

  const update = (next: Attempt) => {
    saveAttempt(window.sessionStorage, next);
    setAttempt(next);
  };
  const finishAttempt = () => {
    update(finish(attempt, Date.now()));
    navigate(ROUTES.review);
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <PortalHeader />
      <main className="flex items-start gap-6 px-12 pt-8 pb-10">
        <nav
          aria-label={t("quizNavigation")}
          className="flex w-60 shrink-0 flex-col items-start gap-3.5 rounded-md border border-line-default bg-surface p-5"
        >
          <h2 className="type-card-title">{t("quizNavigation")}</h2>
          <ol className="flex flex-wrap gap-2">
            {QUESTIONS.map((q, i) => {
              const done = attempt.answers[q.id] !== undefined;
              const current = i === index;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "type-ui-mono flex size-8 items-center justify-center rounded-[calc(var(--radius-sm)-var(--spacing))] outline-none focus-visible:shadow-focus",
                      current ? "inset-ring-2 inset-ring-line-strong" : "inset-ring inset-ring-line-default",
                      done && !current && "bg-brand-subtle",
                    )}
                  >
                    <span className={cn(!done && !current && "opacity-55")}>{i + 1}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="type-ui-caption opacity-60">
            {t("answered", { count: answeredCount(attempt), total })}
          </p>
          <button
            type="button"
            onClick={finishAttempt}
            className="type-ui-label rounded-sm outline-none hover:underline focus-visible:shadow-focus"
          >
            {t("finishAttempt")}
          </button>
        </nav>

        <section className="flex w-230 min-w-0 flex-col gap-4.5 rounded-md border border-line-default bg-surface px-8 py-7">
          <div className="flex w-full items-start">
            <p className="type-mono-tag uppercase opacity-50">
              {t("questionOf", { number: index + 1, total })}
            </p>
            <span className="min-w-0 flex-1" />
            <p className="type-ui-caption opacity-50">{t("point")}</p>
          </div>
          <h1 className="type-ui-title">{question.text[locale]}</h1>
          <RadioGroup
            aria-label={question.text[locale]}
            className="gap-4.5"
            value={attempt.answers[question.id] === undefined ? "" : String(attempt.answers[question.id])}
            onValueChange={(value) => update(answer(attempt, question.id, Number(value), Date.now()))}
          >
            {question.choices.map((choice, i) => (
              <RadioOption
                key={choice}
                value={String(i)}
                title={choice}
                detail={t("option", { letter: OPTION_LETTERS[i] ?? "" })}
              />
            ))}
          </RadioGroup>
          <div className="flex w-full items-center gap-3">
            <p className="type-ui-caption opacity-55">
              {attempt.savedAt === null
                ? null
                : t("saved", { time: portalTime(attempt.savedAt, locale, true) })}
            </p>
            <span className="min-w-0 flex-1" />
            <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              {t("previous")}
            </Button>
            <Button onClick={() => (index + 1 < total ? setIndex(index + 1) : finishAttempt())}>
              {index + 1 < total ? t("nextPage") : t("finishAttempt")}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

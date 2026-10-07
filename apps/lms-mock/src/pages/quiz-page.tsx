import { Button } from "@uki/ui";
import { InfoCard } from "../components/info-card.tsx";
import { PortalHeader } from "../components/portal-header.tsx";
import { QuizHeading } from "../components/quiz-heading.tsx";
import { useT } from "../portal/i18n.tsx";
import { useUkiLocked } from "../portal/lock-state.ts";
import { newAttempt, QUIZ, saveAttempt } from "../portal/quiz.ts";
import { navigate } from "../router/history.ts";
import { ROUTES } from "../router/routes.ts";

/**
 * The quiz page (E.4, portal part). Start attempt stays off until Üki Lock marks the page with
 * data-uki-lock="locked"; then it starts a fresh attempt.
 */
export function QuizPage() {
  const t = useT();
  const locked = useUkiLocked();
  const start = () => {
    saveAttempt(window.sessionStorage, newAttempt(Date.now()));
    navigate(ROUTES.attempt);
  };
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <PortalHeader />
      <main className="mx-auto flex w-full max-w-252 flex-col items-start gap-4 px-6 pt-10 pb-10">
        <QuizHeading />
        <InfoCard
          rows={[
            { id: "opens", label: t("opens"), value: t("opensValue", { time: QUIZ.opensAt }) },
            { id: "limit", label: t("timeLimit"), value: t("minutes", { count: QUIZ.minutes }) },
            { id: "attempts", label: t("attempts"), value: QUIZ.attempts },
            { id: "browser", label: t("browser"), value: t("browserValue") },
          ]}
        />
        <div className="flex items-center gap-4">
          <Button disabled={!locked} onClick={start} data-testid="start-attempt">
            {t("startAttempt")}
          </Button>
          {locked ? null : <p className="type-ui-caption opacity-60">{t("lockFirst")}</p>}
        </div>
      </main>
    </div>
  );
}

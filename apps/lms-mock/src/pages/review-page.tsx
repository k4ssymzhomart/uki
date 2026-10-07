import { Button } from "@uki/ui";
import { useState } from "react";
import { InfoCard } from "../components/info-card.tsx";
import { PortalHeader } from "../components/portal-header.tsx";
import { QuizHeading } from "../components/quiz-heading.tsx";
import { portalTime, usePortalLocale, useT } from "../portal/i18n.tsx";
import { loadAttempt, minutesTaken } from "../portal/quiz.ts";
import { navigate } from "../router/history.ts";
import { HOME } from "../router/routes.ts";

/**
 * The review page (E.9, portal part). Its path is the seed's lms_done_path: when the exam tab gets here,
 * Üki Lock releases the browser.
 */
export function ReviewPage() {
  const t = useT();
  const locale = usePortalLocale();
  const [attempt] = useState(() => loadAttempt(window.sessionStorage));
  const finishedAt = attempt?.finishedAt ?? Date.now();
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <PortalHeader />
      <main className="mx-auto flex w-full max-w-252 flex-col items-start gap-4 px-6 pt-10 pb-10">
        <QuizHeading />
        <InfoCard
          rows={[
            { id: "status", label: t("status"), value: t("finished") },
            {
              id: "submitted",
              label: t("submitted"),
              value: t("opensValue", { time: portalTime(finishedAt, locale) }),
            },
            {
              id: "taken",
              label: t("timeTaken"),
              value: t("minutes", { count: attempt ? minutesTaken(attempt) : 0 }),
            },
            { id: "grade", label: t("grade"), value: t("afterReview") },
          ]}
        />
        <Button variant="secondary" onClick={() => navigate(HOME)}>
          {t("backToCourse")}
        </Button>
      </main>
    </div>
  );
}

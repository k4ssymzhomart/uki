import { useEffect, useState } from "react";
import { AttemptPage } from "./pages/attempt-page.tsx";
import { QuizPage } from "./pages/quiz-page.tsx";
import { ReviewPage } from "./pages/review-page.tsx";
import { PortalI18n } from "./portal/i18n.tsx";
import { format, PORTAL_MESSAGES, portalLocale } from "./portal/messages.ts";
import { navigate, usePathname } from "./router/history.ts";
import { HOME, matchRoute, type RouteId } from "./router/routes.ts";

const PAGES: Record<RouteId, () => React.JSX.Element | null> = {
  quiz: QuizPage,
  attempt: AttemptPage,
  review: ReviewPage,
};

/** Picks the page for the URL; the root and unknown paths go to the quiz page. */
export function App() {
  const route = matchRoute(usePathname());
  const [locale] = useState(() => portalLocale(window.location.search, navigator.language));

  useEffect(() => {
    if (route === null) navigate(HOME, { replace: true });
  }, [route]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // The tab title, as the browser chrome in E.4 and E.9 shows it.
  useEffect(() => {
    if (route === null) return;
    document.title = format(PORTAL_MESSAGES[locale][route === "review" ? "tabSubmitted" : "tabQuiz"]);
  }, [route, locale]);

  if (route === null) return null;
  const Page = PAGES[route];
  return (
    <PortalI18n locale={locale}>
      <Page />
    </PortalI18n>
  );
}

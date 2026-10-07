// The mock portal's own copy. It stands in for KRU's third-party LMS, so its strings live here in English
// and Russian, outside the Üki catalog. English is the text of Figma E.4, E.5 and E.9.

export const PORTAL_LOCALES = ["en", "ru"] as const;
export type PortalLocale = (typeof PORTAL_LOCALES)[number];

const en = {
  tabQuiz: "Quiz 3 · Physics 1",
  tabSubmitted: "Quiz 3 · submitted",
  portal: "KRU Exam portal",
  breadcrumb: "Physics 1  /  Quizzes  /  Quiz 3",
  quizTitle: "Quiz 3 · Kinematics",
  opens: "Opens",
  opensValue: "Today, {time}",
  timeLimit: "Time limit",
  minutes: "{count} min",
  attempts: "Attempts",
  browser: "Browser",
  browserValue: "Üki Lock required",
  startAttempt: "Start attempt",
  lockFirst: "Lock the browser with Üki Lock first.",
  quizNavigation: "Quiz navigation",
  answered: "{count} of {total} answered",
  finishAttempt: "Finish attempt",
  questionOf: "Question {number} of {total}",
  point: "1 point",
  option: "Option {letter}",
  saved: "Saved {time}",
  previous: "Previous",
  nextPage: "Next page",
  status: "Status",
  finished: "Finished",
  submitted: "Submitted",
  timeTaken: "Time taken",
  grade: "Grade",
  afterReview: "After review",
  backToCourse: "Back to the course",
} as const;

export type PortalMessageKey = keyof typeof en;

const ru: Record<PortalMessageKey, string> = {
  tabQuiz: "Тест 3 · Физика 1",
  tabSubmitted: "Тест 3 · отправлен",
  portal: "Экзаменационный портал КРУ",
  breadcrumb: "Физика 1  /  Тесты  /  Тест 3",
  quizTitle: "Тест 3 · Кинематика",
  opens: "Открывается",
  opensValue: "Сегодня, {time}",
  timeLimit: "Ограничение времени",
  minutes: "{count} мин",
  attempts: "Попытки",
  browser: "Браузер",
  browserValue: "Нужен Üki Lock",
  startAttempt: "Начать попытку",
  lockFirst: "Сначала заблокируйте браузер в Üki Lock.",
  quizNavigation: "Навигация по тесту",
  answered: "Отвечено {count} из {total}",
  finishAttempt: "Завершить попытку",
  questionOf: "Вопрос {number} из {total}",
  point: "1 балл",
  option: "Вариант {letter}",
  saved: "Сохранено {time}",
  previous: "Назад",
  nextPage: "Следующая страница",
  status: "Состояние",
  finished: "Завершено",
  submitted: "Отправлено",
  timeTaken: "Затраченное время",
  grade: "Оценка",
  afterReview: "После проверки",
  backToCourse: "Вернуться к курсу",
};

export const PORTAL_MESSAGES: Record<PortalLocale, Record<PortalMessageKey, string>> = { en, ru };

/** ?lang=ru or ?lang=en wins; otherwise the browser's language, English when it is not Russian. */
export function portalLocale(search: string, browserLanguage: string | undefined): PortalLocale {
  const asked = new URLSearchParams(search).get("lang");
  if (asked === "ru" || asked === "en") return asked;
  return browserLanguage?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** Fills {name} placeholders. */
export function format(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "../shell/page-header.tsx";
import { formatCountdown } from "./durations.ts";
import { examEndsAt } from "./exam-end.ts";
import { useWall } from "./wall-store-context.tsx";

/** "Live / Mathematics 2 · Midterm · 00:42:17 left", on the server-corrected clock. */
function Breadcrumb() {
  const t = useTranslations("dashboard.wall");
  const title = useWall((state) => state.exam.title);
  const left = useWall((state) =>
    formatCountdown(examEndsAt(state.exam, Object.values(state.sessions)).getTime() - state.nowMs),
  );
  return <span>{t("breadcrumb", { exam: title, left })}</span>;
}

/** App/Top bar of 2.4 through the shell's PageHeader: the breadcrumb with the time left and "Live wall". */
export function WallHeader() {
  const t = useTranslations("dashboard.wall");
  return <PageHeader breadcrumb={<Breadcrumb />} title={t("title")} />;
}

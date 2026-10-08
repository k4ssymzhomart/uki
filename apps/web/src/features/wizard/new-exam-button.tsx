"use client";

import { Button, useToast } from "@uki/ui";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useTransition } from "react";
import { createExamDraft } from "./wizard-actions.ts";
import { type ScheduledNotice as Notice, stepHref } from "./wizard-model.ts";

/**
 * 0.1's New exam (Figma 51:2046, the exams card header), for the exam office: save_exam_draft makes the
 * draft and the action opens its first step (0.4). A button, not a link, so no prefetch ever makes a
 * draft.
 */
export function NewExamButton() {
  const t = useTranslations("dashboard.wizard");
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await createExamDraft();
          // On success the action has redirected; anything that comes back is an error.
          if (result?.error) toast.show({ kind: "error", message: t(`error.${result.error}`) });
        })
      }
    >
      {t("overview.newExam")}
    </Button>
  );
}

/**
 * After Schedule exam (0.5) the exam office lands on 0.1 with `?scheduled=<code>`: one toast with the
 * code students join with and, when some invites did not go out, a second one that counts them and
 * opens the exam's roster (0.3), where each such row says why. Then the address goes back to /overview.
 */
export function ScheduledNotice({ notice }: { notice: Notice | null }) {
  const t = useTranslations("dashboard.wizard");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || notice === null) return;
    shown.current = true;
    toast.show({
      kind: "success",
      message: t("overview.scheduled", { code: notice.code }),
      duration: 10_000,
    });
    const { examId } = notice;
    if (notice.unsent > 0 && examId !== null) {
      toast.show({
        kind: "error",
        message: t("overview.unsent", { count: notice.unsent }),
        action: t("overview.openRoster"),
        onAction: () => router.push(stepHref(examId, "roster")),
      });
    }
    router.replace(pathname as Route);
  }, [notice, pathname, router, t, toast]);
  return null;
}

"use client";

import { Button, useToast } from "@uki/ui";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useTransition } from "react";
import { createExamDraft } from "./wizard-actions.ts";
import { ExamCodeParam } from "./wizard-model.ts";

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
 * code students join with, then the address goes back to /overview.
 */
export function ScheduledNotice({ code }: { code: string | undefined }) {
  const t = useTranslations("dashboard.wizard");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || !ExamCodeParam.safeParse(code).success) return;
    shown.current = true;
    toast.show({ kind: "success", message: t("overview.scheduled", { code: code ?? "" }), duration: 10_000 });
    router.replace(pathname as Route);
  }, [code, pathname, router, t, toast]);
  return null;
}

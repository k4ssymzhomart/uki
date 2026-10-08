"use client";

import { CHANGE_REQUEST_MAX } from "@uki/contracts";
import { Dialog, TextArea, useToast } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { dayOf, timeOf } from "../../lib/format.ts";
import { confirmSeatsArgs, endsAtMs, type MyExam, seatRange } from "./my-exams-model.ts";

/** The reply of `confirm_seats` the dialog needs, or why it failed. */
export type ConfirmSeatsAction = (input: { exam_id: string; change_request?: string }) => Promise<
  | {
      ok: true;
      assignment: { exam_id: string; confirmed_at: string | null; change_request: string | null };
    }
  | { ok: false; error: "forbidden" | "failed" }
>;

export type ConfirmSeatsDialogProps = {
  /** The assignment to confirm; null keeps the dialog closed. */
  exam: MyExam | null;
  onOpenChange: (open: boolean) => void;
  action: ConfirmSeatsAction;
  /** The row's new confirmation, after confirm_seats answered. */
  onSaved: (reply: { exam_id: string; confirmed_at: string | null; change_request: string | null }) => void;
};

/**
 * 0.9a Confirm seats (Figma 164:15836), on the UI kit's Dialog: the exam's day and times, the seats and
 * how many students sit in them, the languages and when the lobby opens. Confirm seats calls
 * confirm_seats without text. Ask for a change turns the same dialog into a note for the exam office
 * (no frame draws this step; it uses the Dialog's field slot, as 2.4b's Write a message does), and Send
 * request calls confirm_seats with the note.
 */
export function ConfirmSeatsDialog({ exam, onOpenChange, action, onSaved }: ConfirmSeatsDialogProps) {
  const t = useTranslations("dashboard.myExams");
  const locale = useDashboardLocale();
  const toast = useToast();
  const [mode, setMode] = useState<"confirm" | "change">("confirm");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setMode("confirm");
    setText("");
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };

  if (!exam) return null;
  const course = exam.exam.course;
  const range = seatRange(exam);
  const languages = new Intl.ListFormat(locale, { type: "conjunction", style: "long" }).format(
    exam.languages.map((language) => t(`languageIn.${language}`)),
  );
  const body = [
    t("confirm.when", {
      date: dayOf(exam.exam.starts_at, locale),
      start: timeOf(exam.exam.starts_at),
      end: timeOf(endsAtMs(exam)),
    }),
    range
      ? t("confirm.seats", { from: range.from, to: range.to, count: exam.students })
      : t("confirm.allSeats", { count: exam.students }),
    exam.languages.length > 0 ? t("confirm.languages", { languages }) : null,
    t("confirm.lobby", { time: timeOf(exam.exam.lobby_opens_at) }),
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");

  const submit = (changeRequest?: string) =>
    startTransition(async () => {
      const result = await action(confirmSeatsArgs(exam.exam_id, changeRequest));
      if (!result.ok) {
        toast.show({ kind: "error", message: t("toast.failed") });
        return;
      }
      onSaved(result.assignment);
      toast.show({
        kind: "success",
        message:
          result.assignment.change_request === null ? t("toast.confirmed", { course }) : t("toast.requested"),
      });
      close();
    });

  const changing = mode === "change";
  const request = text.trim();
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      icon={changing ? "edit" : "info"}
      title={changing ? t("confirm.change") : t("confirm.title", { course })}
      body={changing ? t("change.body", { course }) : body}
      cancelLabel={changing ? t("change.back") : t("confirm.change")}
      onCancel={() => setMode(changing ? "confirm" : "change")}
      confirmLabel={changing ? t("change.send") : t("confirm.confirm")}
      confirmLoading={pending}
      confirmDisabled={changing && (request.length === 0 || request.length > CHANGE_REQUEST_MAX)}
      onConfirm={() => {
        if (pending) return;
        submit(changing ? request : undefined);
      }}
    >
      {changing ? (
        <TextArea
          label={t("change.field")}
          value={text}
          maxLength={CHANGE_REQUEST_MAX}
          helper={t("change.counter", { count: text.length, max: CHANGE_REQUEST_MAX })}
          onChange={(event) => setText(event.target.value)}
        />
      ) : null}
    </Dialog>
  );
}

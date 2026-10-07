import type { DesktopOs } from "@uki/contracts";
import { ExamCode, StudentNumber } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { Button, Icon, Input } from "@uki/ui";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useTranslations } from "use-intl";
import type { JoinModel } from "../../flow/view-model.ts";
import deskScene from "../shared/assets/uki-scene-desk.png";
import { ScreenFrame } from "../shared/screen-frame.tsx";

export type JoinScreenProps = {
  model: JoinModel;
  /** Continue with a code and a student ID that pass ExamCode and StudentNumber. */
  onJoin: (code: string, studentNumber: string) => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

type FieldErrors = { code: boolean; studentNumber: boolean };

function validate(code: string, studentNumber: string): FieldErrors {
  return {
    code: !ExamCode.safeParse(code).success,
    studentNumber: !StudentNumber.safeParse(studentNumber).success,
  };
}

/**
 * 1.1 Join and 1.1a Wrong code (Figma 51:2058, 151:11483): exam code and student ID, checked against
 * the contracts' formats before the flow calls join_exam.
 */
export function JoinScreen({ model, onJoin, onLanguage, os }: JoinScreenProps) {
  const t = useTranslations();
  const headingId = useId();
  const [code, setCode] = useState(model.code);
  const [studentNumber, setStudentNumber] = useState(model.studentNumber);
  const [shown, setShown] = useState<FieldErrors | null>(
    model.error === "invalid_input" ? validate(model.code, model.studentNumber) : null,
  );

  // A restored session or a new attempt from the flow refills the form.
  useEffect(() => {
    setCode(model.code);
    setStudentNumber(model.studentNumber);
  }, [model.code, model.studentNumber]);

  const wrongCode = model.frame === "1.1a" || model.error === "invalid_code";
  const formatErrors = shown ?? { code: false, studentNumber: false };

  let codeError: string | undefined;
  if (formatErrors.code) codeError = t("join.code.format");
  else if (wrongCode) codeError = t("join.error.body");
  else if (model.error === "network") codeError = t("check.network.fail");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (model.busy) return;
    const errors = validate(code, studentNumber);
    setShown(errors);
    if (errors.code || errors.studentNumber) return;
    onJoin(ExamCode.parse(code), StudentNumber.parse(studentNumber));
  }

  return (
    <ScreenFrame
      frame={model.frame}
      locale={model.locale}
      titleBar={model.titleBar}
      os={os}
      onLanguage={onLanguage}
    >
      <form
        noValidate
        aria-labelledby={headingId}
        onSubmit={submit}
        className="flex h-full flex-1 flex-col items-start justify-center gap-4 overflow-clip pr-14 pl-22"
      >
        <p className="type-mono-overline">{t("join.step", { n: model.step.n, total: model.step.total })}</p>
        <h1 id={headingId} className="whitespace-nowrap type-h2">
          {wrongCode ? t("join.error.title") : t("join.title")}
        </h1>
        <p className="w-full max-w-105 type-body-m">{wrongCode ? t("join.code.format") : t("join.body")}</p>
        <Input
          name="code"
          label={t("join.code.label")}
          helper={t("join.code.helper")}
          error={codeError}
          trailingIcon={codeError === undefined ? undefined : "alert"}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (shown?.code) setShown({ ...shown, code: false });
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="max-w-105"
        />
        <Input
          name="studentNumber"
          label={t("join.student_id.label")}
          helper={t("join.student_id.helper")}
          error={formatErrors.studentNumber ? t("join.student_id.helper") : undefined}
          value={studentNumber}
          onChange={(event) => {
            setStudentNumber(event.target.value);
            if (shown?.studentNumber) setShown({ ...shown, studentNumber: false });
          }}
          inputMode="numeric"
          autoComplete="off"
          className="max-w-105"
        />
        <Button type="submit" loading={model.busy}>
          {t("action.continue")}
        </Button>
        <p className="flex items-center gap-2 overflow-clip pt-4.5 type-card-caption">
          <Icon name="lock" className="size-4" />
          {t("join.privacy")}
        </p>
      </form>
      <div className="flex h-full w-140 min-w-0 flex-col overflow-clip py-10 pr-10">
        <img
          src={deskScene}
          alt=""
          draggable={false}
          className="min-h-0 w-full flex-1 rounded-xl object-contain"
        />
      </div>
    </ScreenFrame>
  );
}

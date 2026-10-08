"use client";

import type { ExamDraft } from "@uki/contracts";
import {
  Button,
  Icon,
  type IconName,
  Popover,
  PopoverAnchor,
  PopoverInfo,
  PopoverTrigger,
  Select,
  SelectItem,
  Tab,
  TabGroup,
  Toggle,
} from "@uki/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import laptopShieldArt from "../../assets/uki-3d-laptop-shield.png";
import { timeOf } from "../../lib/format.ts";
import { useDraft } from "./use-draft.ts";
import type { PreviewLines } from "./wizard-data.ts";
import { WizardFrame } from "./wizard-frame.tsx";
import {
  GAZE_OPTIONS,
  nextStep,
  PHONE_OPTIONS,
  previousStep,
  stepHref,
  withCurrent,
} from "./wizard-model.ts";

export type ChecksViewProps = {
  exam: ExamDraft;
  /** The student app's rule lines in Kazakh, Russian and English for the Student preview. */
  preview: PreviewLines;
};

type ToggleRowProps = {
  icon: IconName;
  title: string;
  detail: string;
  checked: boolean;
  /** Fixed rows (detection that always runs, the microphone that never does) cannot be switched. */
  onChange?: (checked: boolean) => void;
};

/** Toggle row (Figma 45:2062): icon well, title, one-line description and a toggle. */
function ToggleRow({ icon, title, detail, checked, onChange }: ToggleRowProps) {
  const id = useId();
  return (
    <div className="flex w-full items-center gap-4 rounded-md border border-line-default bg-surface p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-brand-subtle">
        <Icon name={icon} className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p id={`${id}-title`} className="type-card-title">
          {title}
        </p>
        <p className="opacity-58 type-card-caption">{detail}</p>
      </div>
      <Toggle
        aria-labelledby={`${id}-title`}
        checked={checked}
        disabled={onChange === undefined}
        onCheckedChange={onChange}
      />
    </div>
  );
}

const PREVIEW_LOCALES = ["kk", "ru", "en"] as const;
type PreviewLocale = (typeof PREVIEW_LOCALES)[number];

/**
 * 0.2 New exam: checks (Figma 51:2048) and 0.2a, the gaze threshold info (85:6315). Browser lock and
 * Identity check switch `exams.checks.lock` and `.identity`; gaze, phone and second person always run
 * on the laptop, and the microphone never does, so those rows are fixed. The thresholds set `gaze_s`
 * and `phone_score`. The Student preview shows the app's own rule lines in the language picked.
 */
export function ChecksView({ exam: initial, preview }: ChecksViewProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations();
  const draft = useDraft(initial, initial.created_at);
  const { exam } = draft;
  const [language, setLanguage] = useState<PreviewLocale>("en");
  const lines = preview[language];
  const next = nextStep("checks", exam.mode);
  const back = previousStep("checks", exam.mode);

  const go = (step: typeof next) => {
    if (step) void draft.leave(stepHref(exam.id, step));
  };

  const rules: { key: keyof typeof lines; icon: IconName; show: boolean }[] = [
    { key: "window", icon: "browser-lock", show: exam.checks.lock },
    { key: "eyes", icon: "gaze", show: true },
    { key: "phone", icon: "phone", show: true },
    { key: "card", icon: "id-card", show: exam.checks.identity },
    { key: "video", icon: "lock", show: true },
  ];

  return (
    <WizardFrame
      examTitle={exam.title}
      step="checks"
      gap="lg"
      footer={draft.savedAt ? t("wizard.checks.footer", { time: timeOf(draft.savedAt) }) : null}
      error={draft.error ? t(`wizard.error.${draft.error}`) : null}
      actions={
        <>
          <Button variant="ghost" onClick={() => go(back)}>
            {t("wizard.back")}
          </Button>
          <Button onClick={() => go(next)} loading={draft.leaving}>
            {next === "browser" ? t("wizard.checks.nextBrowser") : t("wizard.checks.next")}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-6">
        <section className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-col gap-0.5 pb-1">
            <h2 className="type-card-title">{t("wizard.checks.head.title")}</h2>
            <p className="type-card-caption">{t("wizard.checks.head.caption")}</p>
          </div>
          <ToggleRow
            icon="browser-lock"
            title={t("wizard.checks.lock.title")}
            detail={t("wizard.checks.lock.detail")}
            checked={exam.checks.lock}
            onChange={(lock) => draft.update({ checks: { lock } }, 0)}
          />
          <ToggleRow
            icon="gaze"
            title={t("wizard.checks.gaze.title")}
            detail={t("wizard.checks.gaze.detail", { seconds: exam.checks.gaze_s })}
            checked
          />
          <ToggleRow
            icon="phone"
            title={t("wizard.checks.phone.title")}
            detail={t("wizard.checks.phone.detail", { score: exam.checks.phone_score })}
            checked
          />
          <ToggleRow
            icon="id-card"
            title={t("wizard.checks.identity.title")}
            detail={t("wizard.checks.identity.detail")}
            checked={exam.checks.identity}
            onChange={(identity) => draft.update({ checks: { identity } }, 0)}
          />
          <ToggleRow
            icon="users"
            title={t("wizard.checks.second.title")}
            detail={t("wizard.checks.second.detail")}
            checked
          />
          <ToggleRow
            icon="mic"
            title={t("wizard.checks.mic.title")}
            detail={t("wizard.checks.mic.detail")}
            checked={false}
          />
          <div className="flex w-full items-start gap-4 pt-1.5">
            <Popover>
              <PopoverAnchor asChild>
                <div className="flex min-w-0 flex-1">
                  <Select
                    className="flex-1"
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        {t("wizard.checks.gazeThreshold.label")}
                        <PopoverTrigger
                          aria-label={t("wizard.checks.gazeThreshold.info")}
                          className="inline-flex cursor-pointer items-center rounded-pill outline-none focus-visible:shadow-focus"
                        >
                          <Icon name="info" className="size-3.5" />
                        </PopoverTrigger>
                      </span>
                    }
                    helper={t("wizard.checks.gazeThreshold.helper")}
                    value={String(exam.checks.gaze_s)}
                    onValueChange={(value) => draft.update({ checks: { gaze_s: Number(value) } }, 0)}
                  >
                    {withCurrent<number>(GAZE_OPTIONS, exam.checks.gaze_s).map((seconds) => (
                      <SelectItem key={seconds} value={String(seconds)}>
                        {t("wizard.checks.gazeThreshold.value", { seconds })}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </PopoverAnchor>
              <PopoverInfo
                side="top"
                align="start"
                title={t("wizard.checks.gazeInfo.title")}
                body={t("wizard.checks.gazeInfo.body")}
                rows={[
                  { id: "strict", label: t("wizard.checks.gazeInfo.strict"), seconds: 1 },
                  { id: "default", label: t("wizard.checks.gazeInfo.default"), seconds: 2 },
                  { id: "calm", label: t("wizard.checks.gazeInfo.calm"), seconds: 3 },
                ].map((row) => ({
                  id: row.id,
                  label: row.label,
                  value: t("wizard.checks.gazeInfo.value", { seconds: row.seconds }),
                }))}
              />
            </Popover>
            <Select
              className="flex-1"
              label={t("wizard.checks.phoneThreshold.label")}
              helper={t("wizard.checks.phoneThreshold.helper")}
              value={String(exam.checks.phone_score)}
              onValueChange={(value) => draft.update({ checks: { phone_score: Number(value) } }, 0)}
            >
              {withCurrent<number>(PHONE_OPTIONS, exam.checks.phone_score).map((score) => (
                <SelectItem key={score} value={String(score)}>
                  {String(score)}
                </SelectItem>
              ))}
            </Select>
          </div>
        </section>
        <aside className="flex w-90 shrink-0 flex-col gap-4">
          <section className="flex flex-col items-start gap-3.5 rounded-card border border-line-default bg-surface px-5.5 pt-5 pb-5.5">
            <p className="type-mono-tag">{t("wizard.checks.preview.overline")}</p>
            <h2 className="type-card-title">{t("wizard.checks.preview.title")}</h2>
            <TabGroup
              variant="plain"
              value={language}
              onValueChange={(value) => setLanguage(value as PreviewLocale)}
              aria-label={t("wizard.checks.preview.language")}
            >
              {PREVIEW_LOCALES.map((locale) => (
                <Tab key={locale} value={locale}>
                  {tc(`language.${locale}`)}
                </Tab>
              ))}
            </TabGroup>
            <ul className="flex w-full flex-col gap-3.5" lang={language}>
              {rules
                .filter((rule) => rule.show)
                .map((rule) => (
                  <li key={rule.key} className="flex w-full items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-subtle">
                      <Icon name={rule.icon} className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1 type-card-caption">{lines[rule.key]}</span>
                  </li>
                ))}
            </ul>
          </section>
          <section className="flex items-center gap-3.5 rounded-card bg-brand-subtle py-3.5 pr-5 pl-4">
            <Image src={laptopShieldArt} alt="" className="size-18 shrink-0 object-contain" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 className="type-label-m">{t("wizard.checks.privacy.title")}</h2>
              <p className="type-card-caption">{t("wizard.checks.privacy.body")}</p>
            </div>
          </section>
        </aside>
      </div>
    </WizardFrame>
  );
}

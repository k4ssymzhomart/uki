"use client";

import { EXAM_TITLE_MAX, type ExamDraft, type WorkspaceSettings } from "@uki/contracts";
import {
  Button,
  Field,
  fieldBoxVariants,
  Icon,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  RadioOption,
  Select,
  SelectItem,
} from "@uki/ui";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { formatGroupCodes, timeOf } from "../../lib/format.ts";
import { AppLink } from "../shell/app-link.tsx";
import { DatePicker } from "./date-picker.tsx";
import { useDraft } from "./use-draft.ts";
import { WizardFrame } from "./wizard-frame.tsx";
import {
  DURATION_OPTIONS,
  EXAM_KINDS,
  examTimes,
  nextStep,
  stepHref,
  type WizardGroup,
  withCurrent,
} from "./wizard-model.ts";

export type DetailsViewProps = {
  exam: ExamDraft;
  settings: WorkspaceSettings | null;
  groups: readonly WizardGroup[];
  /** Courses the workspace already has, offered while typing. */
  courses: readonly string[];
  /** Other exams' starts, dotted in the date picker. */
  examDays: readonly string[];
  nowMs: number;
};

const LOCALE_ORDER = ["kk", "ru", "en"] as const;

/**
 * 0.4 New exam · Details (Figma 158:12473): title, course, type, groups, date and start (Popover/Date
 * picker 147:2727), duration and where the exam runs, with At a glance beside them. Every change saves
 * into the draft; Next goes to Checks (0.2).
 */
export function DetailsView({ exam: initial, settings, groups, courses, examDays, nowMs }: DetailsViewProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations();
  const id = useId();
  const draft = useDraft(initial, initial.created_at);
  const { exam } = draft;
  const lobbyMinutes = settings?.lobby_minutes ?? 20;
  const times = examTimes(exam.starts_at, exam.duration_min, lobbyMinutes);
  const chosen = groups.filter((group) => exam.group_ids.includes(group.id));
  const others = groups.filter((group) => !exam.group_ids.includes(group.id));
  const studentCount = chosen.reduce((sum, group) => sum + group.students, 0);
  const kinds = withCurrent<string>(EXAM_KINDS, exam.kind);
  const rulesFirst = exam.rules_locale ?? "kk";

  const next = nextStep("details", exam.mode);
  const go = () => {
    if (next) void draft.leave(stepHref(exam.id, next));
  };

  return (
    <WizardFrame
      step="details"
      footer={draft.savedAt ? t("wizard.details.footer", { time: timeOf(draft.savedAt) }) : null}
      error={draft.error ? t(`wizard.error.${draft.error}`) : null}
      actions={
        <>
          <Button variant="ghost" asChild>
            <AppLink href="/overview">{t("wizard.cancel")}</AppLink>
          </Button>
          <Button onClick={go} loading={draft.leaving}>
            {t("wizard.details.next")}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <section
          aria-labelledby={`${id}-details`}
          className="flex min-w-0 flex-1 flex-col items-start gap-4 rounded-card border border-line-default bg-surface p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-details`} className="type-card-title">
              {t("wizard.details.card.title")}
            </h2>
            <p className="opacity-70 type-card-caption">{t("wizard.details.card.caption")}</p>
          </div>
          <Input
            label={t("wizard.details.title.label")}
            value={exam.title}
            maxLength={EXAM_TITLE_MAX}
            onChange={(event) => draft.update({ title: event.target.value })}
            onBlur={() => void draft.flush()}
          />
          <div className="flex w-full items-start gap-4">
            <Field
              controlId={`${id}-course`}
              messageId={`${id}-course-message`}
              label={t("wizard.details.course.label")}
              state="default"
              gap="sm"
              labelTone="muted"
              className="flex-1"
            >
              <div className={fieldBoxVariants({ state: "default" })}>
                <Icon name="graduation-cap" className="size-4.5" />
                <input
                  id={`${id}-course`}
                  list={`${id}-courses`}
                  value={exam.course}
                  maxLength={120}
                  onChange={(event) => draft.update({ course: event.target.value })}
                  onBlur={() => void draft.flush()}
                  className="min-w-0 flex-1 bg-transparent type-label-m outline-none"
                />
                <Icon name="chevron-down" className="size-4.5" />
              </div>
              <datalist id={`${id}-courses`}>
                {courses.map((course) => (
                  <option key={course} value={course} />
                ))}
              </datalist>
            </Field>
            <Select
              className="flex-1"
              label={t("wizard.details.kind.label")}
              icon="exam"
              placeholder={t("wizard.details.kind.placeholder")}
              value={exam.kind === "" ? undefined : exam.kind}
              onValueChange={(kind) => draft.update({ kind }, 0)}
            >
              {kinds.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {(EXAM_KINDS as readonly string[]).includes(kind)
                    ? t(`wizard.details.kind.${kind.toLowerCase() as "midterm"}`)
                    : kind}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col items-start gap-2">
            <p id={`${id}-groups`} className="opacity-70 type-ui-label">
              {t("wizard.details.groups.label")}
            </p>
            <ul aria-labelledby={`${id}-groups`} className="flex flex-wrap items-start gap-2">
              {chosen.map((group) => (
                <li
                  key={group.id}
                  className="flex items-center gap-2 rounded-pill bg-brand-subtle py-2 pr-2.5 pl-3.5 type-ui-label"
                >
                  {t("wizard.details.groups.chip", { code: group.code, count: group.students })}
                  <button
                    type="button"
                    aria-label={t("wizard.details.groups.remove", { code: group.code })}
                    onClick={() =>
                      draft.update({ group_ids: exam.group_ids.filter((groupId) => groupId !== group.id) }, 0)
                    }
                    className="flex cursor-pointer items-center rounded-pill outline-none focus-visible:shadow-focus"
                  >
                    <Icon name="close" className="size-3.5" />
                  </button>
                </li>
              ))}
              {others.length > 0 ? (
                <li>
                  <Menu>
                    <MenuTrigger className="flex cursor-pointer items-center gap-1.5 rounded-pill border border-line-strong border-dashed py-2 pr-3.5 pl-3 outline-none type-ui-label focus-visible:shadow-focus">
                      <Icon name="plus" className="size-3.5" />
                      {t("wizard.details.groups.add")}
                    </MenuTrigger>
                    <MenuContent>
                      {others.map((group) => (
                        <MenuItem
                          key={group.id}
                          onSelect={() => draft.update({ group_ids: [...exam.group_ids, group.id] }, 0)}
                        >
                          {t("wizard.details.groups.option", { code: group.code, count: group.students })}
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </Menu>
                </li>
              ) : null}
            </ul>
          </div>
          <div className="flex w-full items-start gap-4">
            <div className="min-w-0 flex-1">
              <DatePicker
                label={t("wizard.details.when.label")}
                value={exam.starts_at}
                examDays={examDays}
                nowMs={nowMs}
                onApply={(starts_at) => draft.update({ starts_at }, 0)}
              />
            </div>
            <Select
              className="flex-1"
              label={t("wizard.details.duration.label")}
              icon="timer"
              value={String(exam.duration_min)}
              onValueChange={(value) => draft.update({ duration_min: Number(value) }, 0)}
            >
              {withCurrent<number>(DURATION_OPTIONS, exam.duration_min).map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {t("common.minutes", { minutes })}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col items-start gap-2">
            <p id={`${id}-mode`} className="opacity-70 type-ui-label">
              {t("wizard.details.mode.label")}
            </p>
            <RadioGroup
              aria-labelledby={`${id}-mode`}
              orientation="horizontal"
              value={exam.mode}
              onValueChange={(mode) => draft.update({ mode: mode as ExamDraft["mode"] }, 0)}
              className="flex w-full items-start gap-3"
            >
              <RadioOption
                value="app"
                className="flex-1"
                title={t("wizard.details.mode.app.title")}
                detail={t("wizard.details.mode.app.detail")}
              />
              <RadioOption
                value="browser"
                className="flex-1"
                title={t("wizard.details.mode.browser.title")}
                detail={t("wizard.details.mode.browser.detail")}
              />
            </RadioGroup>
          </div>
        </section>
        <aside
          aria-labelledby={`${id}-glance`}
          className="flex w-95 shrink-0 flex-col items-start gap-4.5 rounded-card border border-line-default bg-surface p-6"
        >
          <h2 id={`${id}-glance`} className="type-card-title">
            {t("wizard.details.glance.title")}
          </h2>
          <dl className="flex w-full flex-col gap-4.5">
            {[
              {
                key: "lobby",
                label: t("wizard.details.glance.lobby"),
                value: t("wizard.details.glance.lobbyValue", {
                  time: timeOf(times.lobbyOpensAt),
                  minutes: lobbyMinutes,
                }),
              },
              { key: "ends", label: t("wizard.details.glance.ends"), value: timeOf(times.endsAt) },
              {
                key: "students",
                label: t("wizard.details.glance.students"),
                value:
                  chosen.length === 0
                    ? t("wizard.details.glance.noGroups")
                    : t("wizard.details.glance.studentsValue", {
                        count: studentCount,
                        groups: t("common.groups", {
                          count: chosen.length,
                          codes: formatGroupCodes(chosen.map((group) => group.code)),
                        }),
                      }),
              },
              {
                key: "proctors",
                label: t("wizard.details.glance.proctors"),
                value: t("wizard.details.glance.proctorsValue"),
              },
              {
                key: "rules",
                label: t("wizard.details.glance.rules"),
                value: t("wizard.details.glance.rulesValue", {
                  first: t(`wizard.details.glance.language.${rulesFirst}`),
                  others: LOCALE_ORDER.filter((locale) => locale !== rulesFirst)
                    .map((locale) => tc(`language.${locale}`))
                    .join(", "),
                }),
              },
            ].map((row) => (
              <div
                key={row.key}
                className="flex w-full items-start justify-between gap-3 border-b border-line-default py-2.5 type-ui-label"
              >
                <dt className="opacity-65">{row.label}</dt>
                <dd className="text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="flex w-full items-start gap-2.5 rounded-md bg-brand-subtle px-3.5 py-3 type-card-caption">
            <Icon name="info" className="size-4.5 shrink-0" />
            <span className="min-w-0 flex-1">{t("wizard.details.glance.note")}</span>
          </p>
        </aside>
      </div>
    </WizardFrame>
  );
}

"use client";

import type { Locale, ProctorAssignment, SeatRangeProblem } from "@uki/contracts";
import { Avatar, Button, Checkbox, Chip, Dialog, Icon, Input, initials, Select, SelectItem } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { assignProctors } from "./wizard-actions.ts";
import {
  assignmentRows,
  nextSeatRange,
  type ProctorRow,
  removeProctor,
  seatProblem,
  uncoveredSeats,
  upsertProctor,
  type WizardProctor,
} from "./wizard-model.ts";

const LOCALES: readonly Locale[] = ["kk", "ru", "en"];

export type ProctorsCardProps = {
  examId: string;
  assignments: readonly ProctorAssignment[];
  proctors: readonly WizardProctor[];
  rosterSize: number;
  /** Called with the table assign_proctors returned. */
  onSaved: (assignments: ProctorAssignment[]) => void;
};

type Editing = { mode: "add" } | { mode: "edit"; assignment: ProctorAssignment } | null;

/**
 * 0.3's Proctors card (Figma 55:2832): each proctor with their seats, languages and whether they
 * confirmed (0.9a). Add proctor and a click on a proctor open a dialog for the seat range and languages;
 * every change sends the whole table to assign_proctors, which refuses a gap or an overlap.
 */
export function ProctorsCard({ examId, assignments, proctors, rosterSize, onSaved }: ProctorsCardProps) {
  const t = useTranslations("dashboard.wizard");
  const id = useId();
  const [editing, setEditing] = useState<Editing>(null);
  const [problem, setProblem] = useState<SeatRangeProblem | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = assignmentRows(assignments);
  const gap = uncoveredSeats(rows, rosterSize);
  const languageList = (languages: readonly Locale[]) =>
    languages.map((locale) => t(`language.${locale}`)).join(", ");

  const save = async (table: ProctorRow[]): Promise<boolean> => {
    const local = seatProblem(table);
    if (local) {
      setProblem(local);
      return false;
    }
    setSaving(true);
    const result = await assignProctors({ exam_id: examId, rows: table });
    setSaving(false);
    if (result.ok) {
      setProblem(null);
      setFailed(null);
      onSaved(result.assignments);
      return true;
    }
    if (result.error === "seats") setProblem(result.seats);
    else setFailed(t(`error.${result.error}`));
    return false;
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-card border border-line-default bg-surface px-5 py-4"
    >
      <div className="flex w-full items-center">
        <h2 id={`${id}-title`} className="min-w-0 flex-1 type-card-title">
          {t("roster.proctors.title")}
        </h2>
        <button
          type="button"
          onClick={() => setEditing({ mode: "add" })}
          className="inline-flex cursor-pointer items-center gap-1 rounded-sm outline-none type-label-m focus-visible:shadow-focus"
        >
          <Icon name="plus" className="size-4" />
          {t("roster.proctors.add")}
        </button>
      </div>
      {assignments.length === 0 ? (
        <p className="opacity-70 type-card-caption">{t("roster.proctors.none")}</p>
      ) : null}
      <ul className="flex flex-col gap-2.5">
        {assignments.map((assignment) => {
          const state = assignment.change_request
            ? { status: "warn" as const, label: t("roster.proctors.changeRequested") }
            : assignment.confirmed_at
              ? { status: "ok" as const, label: t("roster.proctors.confirmed") }
              : { status: "idle" as const, label: t("roster.proctors.waiting") };
          return (
            <li key={assignment.staff_id}>
              <button
                type="button"
                aria-label={t("roster.proctors.edit", { name: assignment.full_name })}
                onClick={() => setEditing({ mode: "edit", assignment })}
                className="flex w-full cursor-pointer items-center gap-3 rounded-sm text-left outline-none focus-visible:shadow-focus"
              >
                <Avatar tone="ink" initials={initials(assignment.full_name)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-label-m">{assignment.full_name}</span>
                  <span className="type-card-caption">
                    {t("roster.proctors.seats", {
                      from: assignment.seat_from ?? 0,
                      to: assignment.seat_to ?? 0,
                      languages: languageList(assignment.languages),
                    })}
                  </span>
                </span>
                <Chip status={state.status}>{state.label}</Chip>
              </button>
            </li>
          );
        })}
      </ul>
      {problem ? (
        <p role="alert" className="text-fg-danger type-card-caption">
          {t(`roster.proctors.${problem.problem}`, { from: problem.from, to: problem.to })}
        </p>
      ) : gap && assignments.length > 0 ? (
        <p className="opacity-70 type-card-caption">{t("roster.proctors.uncovered", gap)}</p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-fg-danger type-card-caption">
          {failed}
        </p>
      ) : null}
      {editing ? (
        <ProctorDialog
          key={editing.mode === "edit" ? editing.assignment.staff_id : "add"}
          editing={editing}
          rows={rows}
          proctors={proctors}
          assignments={assignments}
          rosterSize={rosterSize}
          saving={saving}
          problem={problem}
          onClose={() => setEditing(null)}
          onSave={async (table) => {
            if (await save(table)) setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function ProctorDialog({
  editing,
  rows,
  proctors,
  assignments,
  rosterSize,
  saving,
  problem,
  onClose,
  onSave,
}: {
  editing: NonNullable<Editing>;
  rows: ProctorRow[];
  proctors: readonly WizardProctor[];
  assignments: readonly ProctorAssignment[];
  rosterSize: number;
  saving: boolean;
  problem: SeatRangeProblem | null;
  onClose: () => void;
  onSave: (table: ProctorRow[]) => Promise<void>;
}) {
  const t = useTranslations("dashboard.wizard");
  const current = editing.mode === "edit" ? editing.assignment : null;
  const suggested = nextSeatRange(rows, rosterSize);
  const taken = new Set(assignments.map((row) => row.staff_id));
  const choices = proctors.filter((proctor) => !taken.has(proctor.id) || proctor.id === current?.staff_id);
  const [staffId, setStaffId] = useState(current?.staff_id ?? "");
  const [from, setFrom] = useState(String(current?.seat_from ?? suggested.from));
  const [to, setTo] = useState(String(current?.seat_to ?? suggested.to));
  const [languages, setLanguages] = useState<Locale[]>(current?.languages ?? []);
  const fromNumber = Number(from);
  const toNumber = Number(to);
  const valid =
    staffId !== "" &&
    Number.isInteger(fromNumber) &&
    Number.isInteger(toNumber) &&
    fromNumber >= 1 &&
    toNumber >= fromNumber &&
    languages.length > 0;

  const pick = (value: string) => {
    setStaffId(value);
    if (languages.length === 0) {
      const proctor = proctors.find((item) => item.id === value);
      if (proctor) setLanguages(proctor.languages.slice(0, 3));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      icon="user-plus"
      title={
        current
          ? t("roster.proctors.dialog.editTitle", { name: current.full_name })
          : t("roster.proctors.dialog.addTitle")
      }
      cancelLabel={t("cancel")}
      confirmLabel={t("save")}
      confirmDisabled={!valid}
      confirmLoading={saving}
      onConfirm={() =>
        void onSave(
          upsertProctor(rows, {
            staff_id: staffId,
            seat_from: fromNumber,
            seat_to: toNumber,
            languages,
            ...(current?.is_lead ? { is_lead: true } : {}),
          }),
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label={t("roster.proctors.dialog.proctor")}
          placeholder={t("roster.proctors.dialog.choose")}
          value={staffId === "" ? undefined : staffId}
          onValueChange={pick}
          disabled={current !== null}
        >
          {choices.map((proctor) => (
            <SelectItem key={proctor.id} value={proctor.id}>
              {proctor.full_name}
            </SelectItem>
          ))}
        </Select>
        <div className="flex gap-4">
          <Input
            className="flex-1"
            label={t("roster.proctors.dialog.from")}
            inputMode="numeric"
            value={from}
            onChange={(event) => setFrom(event.target.value.replace(/\D/g, ""))}
          />
          <Input
            className="flex-1"
            label={t("roster.proctors.dialog.to")}
            inputMode="numeric"
            value={to}
            onChange={(event) => setTo(event.target.value.replace(/\D/g, ""))}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 type-label-m">{t("roster.proctors.dialog.languages")}</legend>
          <div className="flex gap-5">
            {LOCALES.map((locale) => (
              <Checkbox
                key={locale}
                label={t(`language.${locale}`)}
                checked={languages.includes(locale)}
                onCheckedChange={(checked) =>
                  setLanguages((list) =>
                    checked === true
                      ? LOCALES.filter((item) => item === locale || list.includes(item))
                      : list.filter((item) => item !== locale),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        {problem ? (
          <p role="alert" className="text-fg-danger type-card-caption">
            {t(`roster.proctors.${problem.problem}`, { from: problem.from, to: problem.to })}
          </p>
        ) : null}
        {current ? (
          <Button
            variant="ghost"
            className="self-start text-fg-danger"
            onClick={() => void onSave(removeProctor(rows, current.staff_id))}
          >
            {t("roster.proctors.dialog.remove")}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

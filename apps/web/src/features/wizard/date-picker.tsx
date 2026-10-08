"use client";

import { formatDate } from "@uki/i18n";
import { Button, cn, Field, fieldBoxVariants, Icon, IconButton } from "@uki/ui";
import { useTranslations } from "next-intl";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { dayOf } from "../../lib/format.ts";
import { addMonths, almatyParts, dayInstant, fromAlmaty, monthGrid } from "./wizard-model.ts";

const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export type DatePickerProps = {
  label: string;
  /** The exam's start (ISO). */
  value: string;
  /** Other exams' starts, which get a dot under their day. */
  examDays: readonly string[];
  /** The server's clock when the page rendered: days before today are disabled, today is outlined. */
  nowMs: number;
  onApply: (startsAt: string) => void;
};

/**
 * 0.4's "Date and start" field with Popover/Date picker (Figma 147:2727) under it: the month in Asia/
 * Almaty, Monday first; days before today are disabled, today is outlined, the chosen day is ink and
 * days with another exam carry a dot. The footer shows the chosen day with its start time, which can be
 * typed; Apply saves both.
 */
export function DatePicker({ label, value, examDays, nowMs, onApply }: DatePickerProps) {
  const t = useTranslations("dashboard.wizard");
  const locale = useDashboardLocale();
  const id = useId();
  const current = almatyParts(value);
  const today = almatyParts(nowMs).date;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(current.date.slice(0, 7));
  const [day, setDay] = useState(current.date);
  const [time, setTime] = useState(current.time);
  const examDates = new Set(examDays.map((item) => almatyParts(item).date));
  const shown = t("details.when.value", {
    date: dayOf(value, locale),
    year: current.date.slice(0, 4),
    time: current.time,
  });
  const applied = fromAlmaty(day, time);

  const openChange = (next: boolean) => {
    if (next) {
      setMonth(current.date.slice(0, 7));
      setDay(current.date);
      setTime(current.time);
    }
    setOpen(next);
  };

  return (
    <Field controlId={`${id}-trigger`} messageId={`${id}-message`} label={label} state="default">
      <PopoverPrimitive.Root open={open} onOpenChange={openChange}>
        <PopoverPrimitive.Trigger
          id={`${id}-trigger`}
          className={cn(
            fieldBoxVariants({ state: "default" }),
            "cursor-pointer text-left outline-none data-[state=open]:shadow-focus data-[state=open]:inset-ring-2 data-[state=open]:inset-ring-line-focus",
          )}
        >
          <span className="min-w-0 flex-1 truncate type-body-s">{shown}</span>
          <Icon name="calendar" className="size-5" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={8}
            className="z-50 flex w-80 flex-col items-start gap-3 rounded-md bg-surface p-4 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none"
          >
            <div className="flex w-full items-center justify-between">
              <p className="type-card-title first-letter:uppercase">
                {formatDate(dayInstant(`${month}-15`), locale, { month: "long", year: "numeric" })}
              </p>
              <div className="flex gap-1">
                <IconButton
                  icon="chevron-left"
                  label={t("picker.previous")}
                  disabled={month <= today.slice(0, 7)}
                  onClick={() => setMonth(addMonths(month, -1))}
                />
                <IconButton
                  icon="chevron-right"
                  label={t("picker.next")}
                  onClick={() => setMonth(addMonths(month, 1))}
                />
              </div>
            </div>
            <table className="flex flex-col gap-1">
              <thead className="flex">
                <tr className="flex gap-1">
                  {WEEKDAYS.map((weekday) => (
                    <th
                      key={weekday}
                      scope="col"
                      className="flex h-5 w-9 items-center justify-center font-normal opacity-55 type-ui-caption"
                    >
                      {t(`picker.weekday.${weekday}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="flex flex-col gap-1">
                {monthGrid(month).map((week) => (
                  <tr key={week[0]?.date} className="flex gap-1">
                    {week.map((cell) => {
                      const past = cell.date < today;
                      const selected = cell.date === day;
                      const exam = examDates.has(cell.date);
                      const name = dayOf(dayInstant(cell.date), locale);
                      return (
                        <td key={cell.date}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={exam ? t("picker.examDay", { date: name }) : name}
                            disabled={past}
                            onClick={() => setDay(cell.date)}
                            className={cn(
                              "relative flex size-9 cursor-pointer items-center justify-center rounded-pill type-ui-label outline-none",
                              "hover:bg-hover focus-visible:shadow-focus disabled:cursor-not-allowed disabled:hover:bg-transparent",
                              selected && "bg-inverse text-fg-inverse hover:bg-inverse",
                              !selected && cell.date === today && "inset-ring inset-ring-line-strong",
                              !cell.inMonth ? "opacity-28" : past ? "opacity-38" : "",
                            )}
                          >
                            {cell.day}
                            {exam ? (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-1 left-4 size-1 rounded-pill bg-brand"
                              />
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex w-full items-center justify-between gap-3">
              <p className="flex items-center gap-1 type-ui-label">
                <span>{dayOf(dayInstant(day), locale)}</span>
                <span aria-hidden="true">·</span>
                <input
                  type="time"
                  aria-label={t("picker.time")}
                  value={time}
                  step={300}
                  onChange={(event) => setTime(event.target.value)}
                  className="rounded-sm bg-transparent type-ui-label outline-none focus-visible:shadow-focus"
                />
              </p>
              <Button
                disabled={applied === null}
                onClick={() => {
                  if (applied === null) return;
                  onApply(applied);
                  setOpen(false);
                }}
              >
                {t("picker.apply")}
              </Button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </Field>
  );
}

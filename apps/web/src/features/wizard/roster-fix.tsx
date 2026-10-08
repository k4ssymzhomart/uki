"use client";

import type { RosterColumn, RosterIssue } from "@uki/contracts";
import { Button, Checkbox, Icon, Input, Select, SelectItem } from "@uki/ui";
import { useTranslations } from "next-intl";
import { Popover as PopoverPrimitive } from "radix-ui";
import { type ReactNode, useState } from "react";
import { problemKey, type RosterCells } from "./roster-csv.ts";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "Fix Yerlan’s email": 0.3b names the student by the first name. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** The panel of 0.3b (Figma "Fix email popover" 160:13621): 380 wide, surface, Shadow/Float. */
function FixPanel({
  title,
  body,
  struck,
  children,
  onSubmit,
  saving,
}: {
  title: ReactNode;
  body?: ReactNode;
  /** The address or value being replaced, struck through on status/flag-subtle. */
  struck?: string;
  children: ReactNode;
  onSubmit: () => void;
  saving?: boolean;
}) {
  const t = useTranslations("dashboard.wizard");
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="z-50 flex w-95 flex-col gap-3.5 rounded-md bg-surface p-4.5 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none"
      >
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex flex-col gap-1">
            <PopoverPrimitive.Title asChild>
              <h3 className="type-card-title">{title}</h3>
            </PopoverPrimitive.Title>
            {body ? <p className="opacity-70 type-card-caption">{body}</p> : null}
          </div>
          {struck ? (
            <p className="rounded-sm bg-flag-subtle px-3 py-2 line-through type-ui-mono">{struck}</p>
          ) : null}
          {children}
          <div className="flex justify-end gap-2.5">
            <PopoverPrimitive.Close asChild>
              <Button variant="ghost">{t("cancel")}</Button>
            </PopoverPrimitive.Close>
            <Button type="submit" loading={saving}>
              {t("save")}
            </Button>
          </div>
        </form>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

const ROW_ACTION =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-sm outline-none type-label-m focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45";

/** The row action that opens a fix panel: icon/message 18 and a Label/M word (Row/Lobby 50:2214's Action). */
export function RowActionTrigger({ label }: { label: ReactNode }) {
  return (
    <PopoverPrimitive.Trigger className={ROW_ACTION}>
      <Icon name="message" className="size-4.5" />
      {label}
    </PopoverPrimitive.Trigger>
  );
}

/** The same row action as a plain button (Resend). */
export function RowActionButton({
  label,
  disabled,
  title,
  onClick,
}: {
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={ROW_ACTION} disabled={disabled} title={title} onClick={onClick}>
      <Icon name="message" className="size-4.5" />
      {label}
    </button>
  );
}

export type RowFixProps = {
  /** The 1-based row of the file. */
  row: number;
  cells: RosterCells;
  /** The row's problems; the first one decides what the panel fixes. Empty: edit the address. */
  issues: readonly RosterIssue[];
  groups: readonly string[];
  onSave: (cells: Partial<RosterCells>) => void;
  trigger: ReactNode;
};

/**
 * 0.3a's Edit: one row of the file, before anything is written. The panel fixes the column of the row's
 * first problem (0.3b's layout: what was wrong, the old value struck through, the new value); with no
 * problem it changes the address. Save puts the row back through the checks.
 */
export function RowFix({ row, cells, issues, groups, onSave, trigger }: RowFixProps) {
  const t = useTranslations("dashboard.wizard");
  const tc = useTranslations();
  const issue = issues[0];
  const column: RosterColumn = issue?.column ?? "email";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(cells[column]);
  const [invalid, setInvalid] = useState(false);
  const name = firstName(cells.full_name);

  const title = (() => {
    if (!issue) return t("roster.fix.titleEdit", { name });
    if (name === "" || column === "full_name") return t("roster.fix.titleRow", { row });
    if (column === "email") return t("roster.fix.titleEmail", { name });
    if (column === "student_number") return t("roster.fix.titleNumber", { name });
    if (column === "group") return t("roster.fix.titleGroup", { name });
    return t("roster.fix.titleLocale", { name });
  })();

  const save = () => {
    const next = value.trim();
    if (column === "email" && !EMAIL.test(next)) {
      setInvalid(true);
      return;
    }
    onSave({ [column]: next });
    setOpen(false);
  };

  const label = t(`roster.fix.label.${column}`);
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(cells[column]);
          setInvalid(false);
        }
        setOpen(next);
      }}
    >
      {trigger}
      <FixPanel
        title={title}
        body={issue ? t(`roster.problem.${problemKey(issue)}`, { value: issue.value }) : undefined}
        struck={issue && issue.value !== "" ? issue.value : undefined}
        onSubmit={save}
      >
        {column === "group" ? (
          <Select label={label} value={value === "" ? undefined : value} onValueChange={setValue}>
            {groups.map((code) => (
              <SelectItem key={code} value={code}>
                {t("roster.group", { code })}
              </SelectItem>
            ))}
          </Select>
        ) : column === "locale" ? (
          <Select label={label} value={value === "" ? undefined : value} onValueChange={setValue}>
            {(["kk", "ru", "en"] as const).map((locale) => (
              <SelectItem key={locale} value={locale}>
                {tc(`language.${locale}`)}
              </SelectItem>
            ))}
          </Select>
        ) : (
          <Input
            label={label}
            value={value}
            autoFocus
            inputMode={column === "student_number" ? "numeric" : column === "email" ? "email" : undefined}
            helper={column === "email" ? t("roster.fix.helper") : undefined}
            error={invalid ? t("roster.fix.invalidEmail") : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </FixPanel>
    </PopoverPrimitive.Root>
  );
}

export type InviteFixProps = {
  name: string;
  email: string;
  state: "pending" | "sent" | "failed" | "bounced" | "opened";
  scheduled: boolean;
  onSave: (email: string, roster: boolean) => Promise<boolean>;
  trigger: ReactNode;
};

/**
 * 0.3b Fix email (Figma 160:13301): a student's invite address after the import. A bounced or failed
 * address is struck through with the reason; Save writes the invite (and, ticked, the roster) and, once
 * send-invites exists, sends a scheduled exam's invite again.
 */
export function InviteFix({ name, email, state, scheduled, onSave, trigger }: InviteFixProps) {
  const t = useTranslations("dashboard.wizard");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(email);
  const [roster, setRoster] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const broken = state === "bounced" || state === "failed";

  const save = async () => {
    const next = value.trim().toLowerCase();
    if (!EMAIL.test(next)) {
      setInvalid(true);
      return;
    }
    setSaving(true);
    const ok = await onSave(next, roster);
    setSaving(false);
    if (ok) setOpen(false);
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(broken ? "" : email);
          setInvalid(false);
          setRoster(true);
        }
        setOpen(next);
      }}
    >
      {trigger}
      <FixPanel
        title={
          broken
            ? t("roster.fix.titleEmail", { name: firstName(name) })
            : t("roster.fix.titleEdit", { name: firstName(name) })
        }
        body={
          state === "bounced"
            ? t("roster.fix.bounced")
            : state === "failed"
              ? t("roster.fix.failed")
              : undefined
        }
        struck={broken ? email : undefined}
        onSubmit={() => void save()}
        saving={saving}
      >
        <Input
          label={t("roster.fix.label.email")}
          value={value}
          type="email"
          autoFocus
          helper={scheduled ? t("roster.fix.helperScheduled") : t("roster.fix.helper")}
          error={invalid ? t("roster.fix.invalidEmail") : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        <Checkbox
          label={t("roster.fix.roster")}
          checked={roster}
          onCheckedChange={(checked) => setRoster(checked === true)}
          className="type-body-s"
        />
      </FixPanel>
    </PopoverPrimitive.Root>
  );
}

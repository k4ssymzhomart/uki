"use client";

import type { WorkspaceSettings } from "@uki/contracts";
import { Icon, type IconName, Select, SelectItem, Toggle, useToast } from "@uki/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState, useTransition } from "react";
import { PageHeader } from "../shell/page-header.tsx";
import { type SaveSettingsResult, saveWorkspaceSettings } from "./settings-actions.ts";
import {
  applyChange,
  DURATION_OPTIONS,
  GAZE_OPTIONS,
  LOBBY_OPTIONS,
  PHONE_OPTIONS,
  RETENTION_OPTIONS,
  type SettingsChange,
  withCurrent,
} from "./settings-model.ts";

export type SettingsViewProps = {
  workspaceId: string;
  settings: WorkspaceSettings;
  /** Saves the settings; the server action by default, a stub in tests. */
  save?: (input: { workspaceId: string; settings: WorkspaceSettings }) => Promise<SaveSettingsResult>;
};

/** A card of A.4: Card/Title, an optional caption, then its rows. */
function Card({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex w-full flex-col items-start gap-3.5 overflow-clip rounded-card border border-line-default bg-surface px-5 pt-4.5 pb-5 text-fg-primary"
    >
      <div className="flex flex-col items-start gap-0.5">
        <h2 id={id} className="type-card-title">
          {title}
        </h2>
        {caption === undefined ? null : <p className="opacity-60 type-ui-caption">{caption}</p>}
      </div>
      {children}
    </section>
  );
}

type CheckRowProps = {
  icon: IconName;
  title: string;
  detail: string;
  checked: boolean;
  /** Without it the row is fixed: the check always runs on the laptop. */
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
};

/** One row of "Checks on by default": icon, title and detail, and the toggle. */
function CheckRow({ icon, title, detail, checked, onChange, disabled }: CheckRowProps) {
  const id = useId();
  return (
    <div className="flex w-full items-center gap-3 overflow-clip border-b border-line-default py-2.25 last:border-b-0">
      <Icon name={icon} className="size-4.5" />
      <div className="flex min-w-0 flex-1 flex-col items-start overflow-clip whitespace-nowrap">
        <p id={id} className="type-ui-label">
          {title}
        </p>
        <p className="opacity-60 type-ui-caption">{detail}</p>
      </div>
      <Toggle
        aria-labelledby={id}
        checked={checked}
        disabled={onChange === undefined || disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/**
 * A.4 Settings (Figma 106:10905): the defaults every new exam starts from, in `workspaces.settings`, for
 * the exam office of the workspace. Each change saves at once; save_exam_draft reads the new values for
 * the next exam. The plan's lobby time and default duration join the frame's four selects. Rules
 * language is fixed (students start in Kazakh and switch on 1.1), as are the gaze, phone and second-person
 * checks, which always run. Integrations and Team (A.4a to A.4d) are Phase 3 and stay hidden.
 */
export function SettingsView({
  workspaceId,
  settings: initial,
  save = saveWorkspaceSettings,
}: SettingsViewProps) {
  const t = useTranslations("dashboard.settings");
  const toast = useToast();
  const [settings, setSettings] = useState(initial);
  const saved = useRef(initial);
  const [saving, startSaving] = useTransition();
  const checks = settings.default_checks;

  const change = (next: SettingsChange) => {
    const updated = applyChange(settings, next);
    if (updated === null) {
      toast.show({ id: "settings", kind: "error", message: t("error.invalid") });
      return;
    }
    setSettings(updated);
    startSaving(async () => {
      let result: SaveSettingsResult;
      try {
        result = await save({ workspaceId, settings: updated });
      } catch {
        result = { ok: false, error: "failed" };
      }
      if (result.ok) {
        saved.current = result.settings;
        toast.show({ id: "settings", kind: "success", message: t("saved") });
      } else {
        setSettings(saved.current);
        toast.show({ id: "settings", kind: "error", message: t(`error.${result.error}`) });
      }
    });
  };

  const numberSelect = (
    key: "retention_days" | "lobby_minutes" | "default_duration_min" | "gaze_s" | "phone_score",
    options: readonly number[],
    current: number,
    label: string,
    icon: IconName,
    valueLabel: (value: number) => string,
  ) => (
    <Select
      className="min-w-0 flex-1"
      label={label}
      icon={icon}
      value={String(current)}
      onValueChange={(value) => change({ key, value: Number(value) })}
    >
      {withCurrent(options, current).map((value) => (
        <SelectItem key={value} value={String(value)}>
          {valueLabel(value)}
        </SelectItem>
      ))}
    </Select>
  );

  return (
    <>
      <PageHeader breadcrumb={t("breadcrumb")} title={t("title")} />
      <main className="px-8 pt-7 pb-8" aria-busy={saving || undefined}>
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Card title={t("defaults.title")} caption={t("defaults.caption")}>
              <div className="flex w-full items-start gap-4">
                <Select
                  className="min-w-0 flex-1"
                  label={t("defaults.rulesLanguage.label")}
                  icon="globe"
                  value="kk"
                  disabled
                >
                  <SelectItem value="kk">{t("defaults.rulesLanguage.kk")}</SelectItem>
                </Select>
                {numberSelect(
                  "gaze_s",
                  GAZE_OPTIONS,
                  checks.gaze_s,
                  t("defaults.gaze.label"),
                  "gaze",
                  (seconds) => t("defaults.gaze.value", { seconds }),
                )}
              </div>
              <div className="flex w-full items-start gap-4">
                {numberSelect(
                  "phone_score",
                  PHONE_OPTIONS,
                  checks.phone_score,
                  t("defaults.phone.label"),
                  "phone",
                  (score) => t("defaults.phone.value", { score }),
                )}
                {numberSelect(
                  "retention_days",
                  RETENTION_OPTIONS,
                  settings.retention_days,
                  t("defaults.retention.label"),
                  "archive",
                  (days) => t("defaults.retention.value", { days }),
                )}
              </div>
              <div className="flex w-full items-start gap-4">
                {numberSelect(
                  "default_duration_min",
                  DURATION_OPTIONS,
                  settings.default_duration_min,
                  t("defaults.duration.label"),
                  "timer",
                  (minutes) => t("defaults.duration.value", { minutes }),
                )}
                {numberSelect(
                  "lobby_minutes",
                  LOBBY_OPTIONS,
                  settings.lobby_minutes,
                  t("defaults.lobby.label"),
                  "calendar",
                  (minutes) => t("defaults.lobby.value", { minutes }),
                )}
              </div>
            </Card>

            <Card title={t("checks.title")}>
              <div className="flex w-full flex-col">
                <CheckRow
                  icon="browser-lock"
                  title={t("checks.lock.title")}
                  detail={t("checks.lock.detail")}
                  checked={checks.lock}
                  onChange={(lock) => change({ key: "lock", value: lock })}
                />
                <CheckRow
                  icon="gaze"
                  title={t("checks.gaze.title")}
                  detail={t("checks.gaze.detail")}
                  checked
                />
                <CheckRow
                  icon="phone"
                  title={t("checks.phone.title")}
                  detail={t("checks.phone.detail")}
                  checked
                />
                <CheckRow
                  icon="face-scan"
                  title={t("checks.identity.title")}
                  detail={t("checks.identity.detail")}
                  checked={checks.identity}
                  onChange={(identity) => change({ key: "identity", value: identity })}
                />
                <CheckRow
                  icon="users"
                  title={t("checks.second.title")}
                  detail={t("checks.second.detail")}
                  checked
                />
              </div>
            </Card>
          </div>
          {/* The frame's right column holds Integrations and Team (A.4a to A.4d), which are Phase 3. */}
          <div aria-hidden="true" className="w-90 shrink-0" />
        </div>
      </main>
    </>
  );
}

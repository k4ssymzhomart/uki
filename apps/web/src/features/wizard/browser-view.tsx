"use client";

import { ALLOWED_SITES_MAX, type BrowserRuleSwitch, type ExamDraft } from "@uki/contracts";
import {
  Button,
  Icon,
  type IconName,
  Input,
  LockPopupReady,
  Popover,
  PopoverClose,
  PopoverTrigger,
  RadioGroup,
  RadioOption,
  Toggle,
} from "@uki/ui";
import { useTranslations } from "next-intl";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { timeOf } from "../../lib/format.ts";
import { useDraft } from "./use-draft.ts";
import { WizardFrame } from "./wizard-frame.tsx";
import { lmsHost, nextStep, normaliseHost, previousStep, stepHref } from "./wizard-model.ts";

const URL_PATTERN = /^https?:\/\/\S+$/;

type Rule =
  | { key: Exclude<BrowserRuleSwitch, "calculator">; icon: IconName; fixed?: undefined }
  | { key: "devtools" | "screen_share"; icon: IconName; fixed: true };

/**
 * E.1's rules in the frame's order. Developer tools and screen sharing are fixed by Phase 0 (blocked
 * only on university-managed computers; detected, not blocked) and carry those labels; pausing other
 * extensions is Phase 2, so its row is left out.
 */
const RULES: readonly Rule[] = [
  { key: "copy_paste", icon: "clipboard" },
  { key: "print", icon: "printer" },
  { key: "devtools", icon: "code", fixed: true },
  { key: "screen_share", icon: "screen", fixed: true },
  { key: "full_screen", icon: "app-window" },
];

export type BrowserViewProps = { exam: ExamDraft };

/**
 * E.1 Browser rules (Figma 99:10209), for an exam that runs in the LMS with Üki Lock: the exam link
 * (`lms_url`), the sites open during the exam (`allowed_sites`, plus the calculator), and the rules
 * while locked (`browser_rules`). Beside them, the Üki Lock popup the student will see (E.4).
 */
export function BrowserView({ exam: initial }: BrowserViewProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations();
  const id = useId();
  const draft = useDraft(initial, initial.created_at);
  const { exam } = draft;
  const [link, setLink] = useState(exam.lms_url ?? "");
  const [linkError, setLinkError] = useState(false);
  const [site, setSite] = useState("");
  const [siteError, setSiteError] = useState(false);
  const host = lmsHost(exam.lms_url);
  const sites = exam.allowed_sites.filter((item) => item !== host);

  const go = (step: ReturnType<typeof nextStep>) => {
    if (step) void draft.leave(stepHref(exam.id, step));
  };

  const saveLink = () => {
    const value = link.trim();
    if (value !== "" && !URL_PATTERN.test(value)) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    draft.update({ lms_url: value === "" ? null : value }, 0);
  };

  const addSite = (): boolean => {
    const value = normaliseHost(site);
    if (value === null || sites.length >= ALLOWED_SITES_MAX) {
      setSiteError(true);
      return false;
    }
    setSiteError(false);
    setSite("");
    if (!exam.allowed_sites.includes(value))
      draft.update({ allowed_sites: [...exam.allowed_sites, value] }, 0);
    return true;
  };

  return (
    <WizardFrame
      step="browser"
      gap="lg"
      footer={draft.savedAt ? t("wizard.browser.footer", { time: timeOf(draft.savedAt) }) : null}
      error={draft.error ? t(`wizard.error.${draft.error}`) : null}
      actions={
        <>
          <Button variant="ghost" onClick={() => go(previousStep("browser", exam.mode))}>
            {t("wizard.back")}
          </Button>
          <Button onClick={() => go(nextStep("browser", exam.mode))} loading={draft.leaving}>
            {t("wizard.browser.next")}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-6">
        <section className="flex min-w-0 flex-1 flex-col gap-3.5">
          <h2 id={`${id}-mode`} className="type-card-title">
            {t("wizard.browser.mode.title")}
          </h2>
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
          <Input
            label={t("wizard.browser.link.label")}
            type="url"
            inputMode="url"
            value={link}
            error={linkError ? t("wizard.browser.link.invalid") : undefined}
            onChange={(event) => setLink(event.target.value)}
            onBlur={saveLink}
          />
          <h2 id={`${id}-sites`} className="type-card-title">
            {t("wizard.browser.sites.title")}
          </h2>
          <ul aria-labelledby={`${id}-sites`} className="flex flex-wrap items-start gap-2">
            {host ? (
              <li className="flex items-center gap-2 rounded-pill border border-line-default bg-surface px-3 py-2 type-ui-label">
                <Icon name="globe" className="size-4" />
                {host}
                <Icon name="lock" className="size-3.5" label={t("wizard.browser.sites.locked")} />
              </li>
            ) : null}
            {sites.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 rounded-pill border border-line-default bg-surface px-3 py-2 type-ui-label"
              >
                <Icon name="globe" className="size-4" />
                {item}
                <button
                  type="button"
                  aria-label={t("wizard.browser.sites.remove", { host: item })}
                  onClick={() =>
                    draft.update({ allowed_sites: exam.allowed_sites.filter((value) => value !== item) }, 0)
                  }
                  className="flex cursor-pointer items-center rounded-pill outline-none focus-visible:shadow-focus"
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </li>
            ))}
            {exam.browser_rules.calculator ? (
              <li className="flex items-center gap-2 rounded-pill border border-line-default bg-surface px-3 py-2 type-ui-label">
                <Icon name="app-window" className="size-4" />
                {t("wizard.browser.sites.calculator")}
                <button
                  type="button"
                  aria-label={t("wizard.browser.sites.removeCalculator")}
                  onClick={() => draft.update({ browser_rules: { calculator: false } }, 0)}
                  className="flex cursor-pointer items-center rounded-pill outline-none focus-visible:shadow-focus"
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </li>
            ) : (
              <li>
                <button
                  type="button"
                  onClick={() => draft.update({ browser_rules: { calculator: true } }, 0)}
                  className="flex cursor-pointer items-center gap-2 rounded-pill border border-line-default border-dashed px-3 py-2 outline-none type-ui-label focus-visible:shadow-focus"
                >
                  <Icon name="plus" className="size-4" />
                  {t("wizard.browser.sites.addCalculator")}
                </button>
              </li>
            )}
            <li>
              <Popover onOpenChange={() => setSiteError(false)}>
                <PopoverTrigger className="flex cursor-pointer items-center gap-2 rounded-pill border border-line-default border-dashed px-3 py-2 outline-none type-ui-label focus-visible:shadow-focus">
                  <Icon name="plus" className="size-4" />
                  {t("wizard.browser.sites.add")}
                </PopoverTrigger>
                <PopoverPrimitive.Portal>
                  <PopoverPrimitive.Content
                    align="start"
                    sideOffset={8}
                    className="z-50 flex w-80 flex-col gap-3 rounded-md bg-surface p-4 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none"
                  >
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addSite();
                      }}
                    >
                      <Input
                        label={t("wizard.browser.sites.addLabel")}
                        value={site}
                        error={siteError ? t("wizard.browser.sites.invalid") : undefined}
                        onChange={(event) => setSite(event.target.value)}
                      />
                      <div className="flex justify-end gap-2.5">
                        <PopoverClose asChild>
                          <Button variant="ghost">{t("wizard.cancel")}</Button>
                        </PopoverClose>
                        <Button type="submit">{t("wizard.browser.sites.add")}</Button>
                      </div>
                    </form>
                  </PopoverPrimitive.Content>
                </PopoverPrimitive.Portal>
              </Popover>
            </li>
          </ul>
          <h2 className="type-card-title">{t("wizard.browser.rules.title")}</h2>
          <ul className="flex w-full flex-col rounded-md border border-line-default bg-surface px-4 py-1">
            {RULES.map((rule, index) => {
              const titleId = `${id}-${rule.key}`;
              return (
                <li
                  key={rule.key}
                  className={`flex items-center gap-3 py-2.25 ${index < RULES.length - 1 ? "border-b border-line-default" : ""}`}
                >
                  <Icon name={rule.icon} className="size-4.5" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p id={titleId} className="type-ui-label">
                      {t(`wizard.browser.rule.${rule.key}.title`)}
                    </p>
                    <p className="opacity-60 type-ui-caption">
                      {t(`wizard.browser.rule.${rule.key}.detail`)}
                    </p>
                  </div>
                  <Toggle
                    aria-labelledby={titleId}
                    checked={rule.fixed ? true : exam.browser_rules[rule.key]}
                    disabled={rule.fixed === true}
                    onCheckedChange={
                      rule.fixed ? undefined : (on) => draft.update({ browser_rules: { [rule.key]: on } }, 0)
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
        <aside className="flex w-90 shrink-0 flex-col gap-3.5">
          <p className="opacity-50 type-mono-tag">{t("wizard.browser.preview.overline")}</p>
          <div inert>
            <LockPopupReady
              headerTitle={tc("lock.name")}
              badge={tc("lock.ready.badge")}
              overline={tc("lock.ready.next")}
              exam={exam.title}
              examMeta={tc("lock.ready.when", {
                time: timeOf(exam.starts_at),
                minutes: exam.duration_min,
                host: host ?? "",
              })}
              checks={[
                {
                  id: "app",
                  status: "pass",
                  title: tc("lock.ready.app.title"),
                  detail: tc("lock.ready.app.ok"),
                },
                {
                  id: "tabs",
                  status: "wait",
                  title: tc("lock.ready.tabs.title"),
                  detail: tc("lock.ready.tabs.body", { count: 3 }),
                },
                {
                  id: "screen",
                  status: "pass",
                  title: tc("check.screen.title"),
                  detail: tc("lock.ready.screen.off"),
                },
              ]}
              action={{ label: tc("lock.ready.start"), onClick: () => undefined }}
              note={
                exam.browser_rules.calculator ? tc("lock.ready.note.full") : tc("lock.ready.note.portal_only")
              }
              footer={tc("lock.app.connected")}
            />
          </div>
        </aside>
      </div>
    </WizardFrame>
  );
}

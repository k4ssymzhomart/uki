"use client";

import { Button, Checkbox, Input, Select, SelectItem, TextArea } from "@uki/ui";
import { Mascot } from "@uki/ui/art";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useActionState, useMemo, useState } from "react";
import { LandingLink } from "./landing-parts.tsx";
import {
  demoDayCalendar,
  initialPilotState,
  monthDate,
  PILOT_LIMITS,
  PILOT_ROLES,
  type PilotFormState,
  STUDENT_RANGES,
} from "./pilot-model.ts";

export type PilotAction = (previous: PilotFormState, form: FormData) => Promise<PilotFormState>;

/**
 * /pilot: the request form beside the pilot plan (Figma 194:4014), and Sent in its place once the
 * request is stored (195:4090). The header band and the plan come from the server.
 */
export function PilotScreen({
  band,
  sentBand,
  plan,
  months,
  action,
}: {
  band: ReactNode;
  sentBand: ReactNode;
  plan: ReactNode;
  months: readonly string[];
  action: PilotAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialPilotState(months));
  if (state.status === "sent") {
    return (
      <>
        {sentBand}
        <PilotSent state={state} />
      </>
    );
  }
  return (
    <>
      {band}
      <div className="mx-auto flex w-full max-w-300 flex-col gap-10 px-6 pb-20 lg:px-16 xl:flex-row xl:gap-20 xl:px-0 xl:pb-30">
        <div className="order-2 xl:order-1 xl:w-140 xl:shrink-0 xl:pt-16">{plan}</div>
        <div className="order-1 -mt-10 xl:order-2 xl:-mt-30 xl:w-140 xl:shrink-0">
          <PilotForm state={state} formAction={formAction} pending={pending} months={months} />
        </div>
      </div>
    </>
  );
}

function PilotForm({
  state,
  formAction,
  pending,
  months,
}: {
  state: Exclude<PilotFormState, { status: "sent" }>;
  formAction: (form: FormData) => void;
  pending: boolean;
  months: readonly string[];
}) {
  const t = useTranslations("dashboard.landing.pilot.form");
  const format = useFormatter();
  const { values, errors } = state;
  const [message, setMessage] = useState(values.message);
  const error = (field: keyof typeof errors) => {
    const code = errors[field];
    return code ? t(`error.${code}`, { max: PILOT_LIMITS[field] }) : undefined;
  };
  const refusal =
    state.status === "rateLimited"
      ? t("error.rateLimited")
      : state.status === "failed"
        ? t("error.failed")
        : null;

  return (
    <form
      action={formAction}
      noValidate
      className="relative z-10 flex flex-col gap-4 rounded-xl bg-surface px-6 py-7 text-fg-primary shadow-float lg:px-8"
    >
      <h2 className="type-ui-title">{t("title")}</h2>
      <div className="grid gap-x-3 gap-y-4 lg:grid-cols-2">
        <Input
          label={t("name")}
          name="name"
          autoComplete="name"
          required
          maxLength={PILOT_LIMITS.name}
          placeholder={t("namePlaceholder")}
          defaultValue={values.name}
          error={error("name")}
        />
        <Input
          label={t("email")}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={PILOT_LIMITS.email}
          placeholder={t("emailPlaceholder")}
          defaultValue={values.email}
          error={error("email")}
        />
        <Input
          label={t("university")}
          name="university"
          autoComplete="organization"
          required
          maxLength={PILOT_LIMITS.university}
          placeholder={t("universityPlaceholder")}
          defaultValue={values.university}
          error={error("university")}
        />
        <Select label={t("role")} name="role" icon="building" defaultValue={values.role}>
          {PILOT_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {t(`roles.${role}`)}
            </SelectItem>
          ))}
        </Select>
        <Select label={t("students")} name="students" icon="users" defaultValue={values.students}>
          {STUDENT_RANGES.map((range) => (
            <SelectItem key={range} value={range}>
              {t(`studentRanges.${range}`)}
            </SelectItem>
          ))}
        </Select>
        <Select label={t("when")} name="when" icon="calendar" defaultValue={values.when}>
          {months.map((month) => (
            <SelectItem key={month} value={month}>
              {format.dateTime(monthDate(month), { month: "long", year: "numeric" })}
            </SelectItem>
          ))}
        </Select>
      </div>
      <TextArea
        label={t("message")}
        name="message"
        maxLength={PILOT_LIMITS.message}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        helper={t("messageHelper", { count: message.length, max: PILOT_LIMITS.message })}
        error={error("message")}
      />
      <Checkbox name="demoDay" value="on" defaultChecked={values.demoDay} label={t("demoDay")} />
      {refusal ? (
        <p role="alert" className="text-fg-danger type-ui-caption">
          {refusal}
        </p>
      ) : null}
      <Button type="submit" variant="brand" loading={pending} className="w-full">
        {t("submit")}
      </Button>
      <p className="opacity-64 type-card-caption">{t("note")}</p>
    </form>
  );
}

function PilotSent({ state }: { state: Extract<PilotFormState, { status: "sent" }> }) {
  const t = useTranslations("dashboard.landing.pilot");
  const format = useFormatter();
  const { request, reference } = state;
  const calendarHref = useMemo(() => {
    const ics = demoDayCalendar({
      title: t("sent.calendarTitle"),
      place: t("sent.calendarPlace"),
      stamp: new Date(),
    });
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  }, [t]);
  const rows = [
    { label: t("sent.university"), value: request.university },
    { label: t("sent.students"), value: t(`form.studentRanges.${request.students}`) },
    {
      label: t("sent.when"),
      value: format.dateTime(monthDate(request.when), { month: "long", year: "numeric" }),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-160 flex-col items-center px-6 pb-26 lg:px-0">
      <section
        aria-live="polite"
        className="relative z-10 -mt-10 flex w-full flex-col items-center gap-4 rounded-xl bg-surface px-6 py-10 text-center text-fg-primary shadow-float lg:-mt-46 lg:px-12"
      >
        <div className="relative size-37.5">
          <Mascot
            pose="celebrating"
            size={150}
            className="absolute top-[19.17%] left-[10.21%] h-auto w-[79.7%]"
          />
        </div>
        <h1 className="type-h2">{t("sent.title")}</h1>
        <p className="max-w-125 opacity-72 type-body-m">{t("sent.body", { email: request.email })}</p>
        <dl className="flex w-full flex-col rounded-md bg-subtle px-5 py-2 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-2">
              <dt className="opacity-64 type-card-caption">{row.label}</dt>
              <dd className="text-right type-label-m">{row.value}</dd>
            </div>
          ))}
          {reference ? (
            <div className="flex items-start justify-between gap-4 py-2">
              <dt className="opacity-64 type-card-caption">{t("sent.request")}</dt>
              <dd className="type-mono-s">{reference}</dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button variant="secondary" asChild>
            <a href={calendarHref} download="uki-demo-day.ics">
              {t("sent.calendar")}
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <LandingLink href="/">{t("sent.back")}</LandingLink>
          </Button>
        </div>
      </section>
      <p className="mt-9 text-center text-fg-accent type-mono-overline">{t("sent.overline")}</p>
    </div>
  );
}

"use client";

import { LOCALE_LABELS } from "@uki/i18n";
import { Avatar, Badge, Button, Chip, Icon, type IconName, initials, StatTile } from "@uki/ui";
import type { Route } from "next";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { timeOf } from "../../lib/format.ts";
import { PageHeader } from "../shell/page-header.tsx";
import { NAV, NAV_HREFS } from "../shell/shell-model.ts";
import { formatDayLongMonth, formatDayMonth, formatDayMonthYear } from "./student-format.ts";
import {
  dataKept,
  examHistory,
  latestConsent,
  profileDevices,
  profileStats,
} from "./student-profile-model.ts";
import type { StudentProfileData } from "./students-data.ts";
import { REVIEW_STATUS_CHIP } from "./students-model.ts";

export type StudentProfileViewProps = StudentProfileData;

/** A card of A.3's right column and the exam history: Card/Title over its rows. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex w-full flex-col items-start gap-3 overflow-clip rounded-card border border-line-default bg-surface px-5 pt-4.5 pb-5 text-fg-primary">
      <h2 className="type-card-title">{title}</h2>
      {children}
    </section>
  );
}

/** One item of the Devices, Consent and Data kept cards: icon well, label and caption. */
function Item({ icon, title, caption }: { icon: IconName; title: ReactNode; caption: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-3 overflow-clip">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-clip rounded-sm bg-subtle">
        <Icon name={icon} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-clip whitespace-nowrap">
        <p className="type-ui-label">{title}</p>
        <p className="opacity-55 type-ui-caption">{caption}</p>
      </div>
    </div>
  );
}

/**
 * A.3 Student profile (Figma 105:10746): who the student is, their exams with each decision, the devices
 * from `sessions.device`, when and in which language they last accepted the exam rules
 * (`rules_accepted_at`, `rules_locale`), and the data kept about them. Message, Export data, the
 * readiness badge and the camera consent row are not drawn; Delete on request appears with the privacy
 * centre (WP 1.12). See docs/decisions.md, 1.11.
 */
export function StudentProfileView({
  student,
  sessions,
  flags,
  decisions,
  frames,
  retentionDays,
}: StudentProfileViewProps) {
  const t = useTranslations("dashboard.students");
  const format = useFormatter();
  const locale = useDashboardLocale();
  const history = examHistory(sessions, flags, decisions);
  const stats = profileStats(history, decisions);
  const devices = profileDevices(sessions);
  const consent = latestConsent(sessions);
  const kept = dataKept(frames, sessions, retentionDays);

  const group = student.group_code === null ? t("row.noGroup") : t("row.group", { code: student.group_code });
  const programme =
    student.programme && student.year !== null
      ? t("row.programmeYear", { programme: student.programme, year: student.year })
      : (student.programme ??
        (student.year === null ? null : t("filter.year.value", { year: student.year })));
  const who = [student.student_number, group, programme].filter((part): part is string => !!part).join(" · ");
  const seen = (at: string | null) =>
    at === null ? t("profile.devices.notSeen") : formatDayMonth(at, locale);

  return (
    <>
      <PageHeader breadcrumb={t("profile.breadcrumb", { group })} title={student.full_name} />
      <main className="px-8 pt-7 pb-8">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="flex w-full items-center gap-4 overflow-clip rounded-card border border-line-default bg-surface px-5 py-4.5 text-fg-primary">
              <Avatar
                tone="lime"
                initials={initials(student.full_name, locale)}
                className="size-14 type-body-l"
              />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 overflow-clip">
                <p className="max-w-full truncate type-ui-title">{student.full_name}</p>
                <p className="max-w-full truncate opacity-55 type-ui-mono">{who}</p>
                <div className="flex items-start gap-1.5">
                  <Badge tone="neutral">{LOCALE_LABELS[student.locale]}</Badge>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-3 gap-4">
              <StatTile
                className="items-stretch"
                label={t("profile.stat.exams.label")}
                value={format.number(stats.exams)}
                caption={
                  stats.firstExamAt === null
                    ? undefined
                    : t("profile.stat.exams.caption", { date: formatDayLongMonth(stats.firstExamAt, locale) })
                }
              />
              <StatTile
                className="items-stretch"
                label={t("profile.stat.flags.label")}
                value={format.number(stats.flags)}
                caption={
                  stats.topCourse === null
                    ? undefined
                    : t("profile.stat.flags.caption", {
                        count: stats.topCourse.flags,
                        course: stats.topCourse.course,
                      })
                }
              />
              <StatTile
                className="items-stretch"
                label={t("profile.stat.decisions.label")}
                value={format.number(stats.decisions)}
                caption={
                  stats.latest === null
                    ? undefined
                    : t("profile.stat.decisions.caption", {
                        latest: t(`decision.${stats.latest}`),
                        committee: stats.committee,
                      })
                }
              />
            </div>

            <Card title={t("profile.history.title")}>
              {history.length === 0 ? (
                <p className="opacity-60 type-ui-caption">{t("profile.history.empty")}</p>
              ) : (
                <ul className="flex w-full flex-col gap-3">
                  {history.map((row) => (
                    <li
                      key={row.sessionId}
                      data-session-id={row.sessionId}
                      className="flex w-full items-center gap-4 overflow-clip border-b border-line-default py-2 last:border-b-0"
                    >
                      <p className="w-14 shrink-0 opacity-55 type-ui-mono">
                        {formatDayMonth(row.startsAt, locale)}
                      </p>
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-clip whitespace-nowrap">
                        <p className="max-w-full truncate type-label-m">{row.title}</p>
                        <p className="opacity-55 type-ui-caption">
                          {t("profile.history.detail", {
                            time:
                              row.usedMin === null
                                ? t("profile.history.duration", { duration: row.durationMin })
                                : t("profile.history.used", { used: row.usedMin, duration: row.durationMin }),
                            flags: t("profile.history.flags", { count: row.flags }),
                          })}
                        </p>
                      </div>
                      <Chip status={REVIEW_STATUS_CHIP[row.status]}>{t(`status.${row.status}`)}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex w-90 shrink-0 flex-col gap-4">
            <Card title={t("profile.devices.title")}>
              {devices.length === 0 ? (
                <p className="opacity-60 type-ui-caption">{t("profile.devices.empty")}</p>
              ) : (
                devices.map((device) =>
                  device.kind === "app" ? (
                    <Item
                      key={`app-${device.os}-${device.version}`}
                      icon="laptop"
                      title={t(`profile.devices.os.${device.os}`)}
                      caption={t("profile.devices.app", {
                        version: device.version,
                        seen: seen(device.seenAt),
                      })}
                    />
                  ) : (
                    <Item
                      key={`lock-${device.browser ?? ""}-${device.version}`}
                      icon="puzzle"
                      title={
                        device.browser === null
                          ? t("profile.devices.lock")
                          : t("profile.devices.lockIn", { browser: device.browser })
                      }
                      caption={t("profile.devices.lockVersion", {
                        version: device.version,
                        seen: seen(device.seenAt),
                      })}
                    />
                  ),
                )
              )}
            </Card>

            <Card title={t("profile.consent.title")}>
              {consent === null ? (
                <Item icon="check" title={t("profile.consent.rules")} caption={t("profile.consent.notYet")} />
              ) : (
                <Item
                  icon="check"
                  title={t("profile.consent.rulesIn", { language: t(`language.${consent.locale}`) })}
                  caption={t("profile.consent.accepted", {
                    date: formatDayMonth(consent.acceptedAt, locale),
                    time: timeOf(consent.acceptedAt),
                  })}
                />
              )}
            </Card>

            <Card title={t("profile.kept.title")}>
              <Item
                icon="report"
                title={t("profile.kept.frames", { count: kept.frames })}
                caption={
                  kept.framesGoneAt === null
                    ? t("profile.kept.noFrames")
                    : t("profile.kept.deletedOn", { date: formatDayMonthYear(kept.framesGoneAt, locale) })
                }
              />
              <Item
                icon="list-check"
                title={t("profile.kept.events", { count: kept.exams })}
                caption={t("profile.kept.eventsKept")}
              />
              <Item icon="cloud-off" title={t("profile.kept.video")} caption={t("profile.kept.videoNever")} />
              {NAV.privacy.built ? (
                <Button variant="secondary" className="w-full" asChild>
                  <Link href={NAV_HREFS.privacy as Route} prefetch={false}>
                    {t("profile.kept.delete")}
                  </Link>
                </Button>
              ) : null}
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

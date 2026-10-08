"use client";

import { Avatar, Face, Icon, initials, shortName } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { timeOf } from "../../lib/format.ts";
import { printedVerifyCode } from "../report/report-model.ts";
import { formatDayMonth } from "../students/student-format.ts";
import { type AuditEntry, actionMessage } from "./privacy-model.ts";

/**
 * The words of an audit entry on A.6 and A.5's Recent access: who did it, what they did, on what, and
 * when ("9 Oct · 11:52" in Asia/Almaty). Names come from the data; every other word is a message.
 */
export function useAuditText() {
  const t = useTranslations("dashboard.privacy.audit");
  const locale = useDashboardLocale();
  return {
    time: (at: string) => t("time", { day: formatDayMonth(at, locale), time: timeOf(at) }),
    who: (entry: AuditEntry): string => {
      switch (entry.actor.kind) {
        case "staff":
          return entry.actor.name ?? t("who.staff");
        case "student":
          return entry.actor.name ?? t("who.student");
        case "share":
          return t("who.share");
        case "system":
          return t("who.system");
      }
    },
    action: (entry: AuditEntry): string => {
      const message = actionMessage(entry);
      // An action this page has no words for shows its stored name, which is data.
      return message === null ? entry.action : t(`action.${message.key}`, message.values);
    },
    object: (entry: AuditEntry): string => {
      const object = entry.object;
      switch (object.kind) {
        case "exam":
          return t("object.pair", { first: object.title, second: object.examKind });
        case "session":
          return t("object.pair", { first: shortName(object.student), second: object.exam });
        case "student":
          return shortName(object.student);
        case "report":
          return printedVerifyCode(object.code);
        case "settings":
        case "privacy":
        case "auditLog":
        case "workspace":
          return t(`object.${object.kind}`);
        case "none":
          return t("object.none");
      }
    },
    locale,
  };
}

/**
 * Who did it: the staff member's initials (lime for the signed-in user, paper for others), a student's,
 * the link icon for a share link, or Üki's face for the system, as A.6 (108:11590) draws it.
 */
export function WhoMark({ entry, me, size }: { entry: AuditEntry; me: string | null; size: "sm" | "xs" }) {
  const locale = useDashboardLocale();
  // Figma draws the initials at 11.4 px in the 28 px avatar and 9.75 px in the 24 px one; UI/Caption at
  // medium weight is the nearest type style.
  const box = size === "sm" ? "size-7 type-ui-caption font-medium" : "size-6 type-ui-caption font-medium";
  if (entry.actor.kind === "system") return <Face state="neutral" size={28} className={box} />;
  if (entry.actor.kind === "share") {
    return <Avatar tone="paper" className={box} initials={<Icon name="link" className="size-3.5" />} />;
  }
  const name = entry.actor.name;
  const own = entry.actor.kind === "staff" && me !== null && entry.actor.id === me;
  return (
    <Avatar
      tone={own ? "lime" : "paper"}
      className={box}
      initials={name === null ? <Icon name="user" className="size-3.5" /> : initials(name, locale)}
    />
  );
}

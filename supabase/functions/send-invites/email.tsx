// The invite email, 0.8 (161:13438), built with React Email: the 600 px card on the grey stage, the
// wordmark and the three languages, the lime hero with the mascot, the exam code and student ID in the
// dashed box, the three steps, the download button, the privacy line and the footer. Strings come from
// the catalog's `email.invite.*` keys in the student's language; times are the workspace's (Asia/Almaty
// for KRU). The three images are Figma's 2x PNG exports, served by the dashboard from /email/; nothing
// in the email is unique to a recipient except its text, so loading the images tells nobody who opened
// it (no tracking pixel, no tracked links).
//
// Each language is rendered once per send (`renderInviteTemplate`) with markers where the student's
// name, number and group go, and `fillInvite` puts each student in: rendering 100 emails one by one
// would spend the function's CPU time on the same markup.
import { Body } from "@react-email/body";
import { Button } from "@react-email/button";
import { Column } from "@react-email/column";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Html } from "@react-email/html";
import { Img } from "@react-email/img";
import { Preview } from "@react-email/preview";
import { render, toPlainText } from "@react-email/render";
import { Row } from "@react-email/row";
import { Section } from "@react-email/section";
import { Text } from "@react-email/text";
import type { CSSProperties, ReactNode } from "react";
import { type EmailKey, type EmailLocale, formatEmailMessage, type MessageArgs } from "./messages.ts";
import { color, over, PHONE_CSS, radius, SANS, space, type } from "./theme.ts";

/** The exam as the email shows it. */
export interface InviteExam {
  /** `exams.title`, like "Mathematics 2 · Midterm". */
  title: string;
  /** The join code, like MATH2-204-FRI. */
  code: string;
  startsAt: string;
  lobbyOpensAt: string;
  /** The workspace's time zone; every time in the email is in it. */
  timeZone: string;
}

/** The student the email is for. */
export interface InviteStudent {
  name: string;
  number: string;
  /** The group code, or null for a student without a group. */
  group: string | null;
}

export interface InviteSettings {
  /** The workspace's name, the exam office that sends the invite. */
  office: string;
  /** Where the installers are. */
  downloadUrl: string;
  /** The folder with the three images (`<dashboard>/email`), or null to send the email without them. */
  assetsUrl: string | null;
  /** The test invite from 0.5: its own subject. */
  test: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The images in /email/ of the dashboard (apps/web/public/email), exported from 0.8 at 2x. */
export const EMAIL_IMAGES = {
  wordmark: { file: "uki-wordmark.png", width: 32, height: 24 },
  mascot: { file: "uki-mascot-hello.png", width: 92, height: 92 },
  lock: { file: "icon-lock.png", width: 16, height: 16 },
} as const;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

/**
 * The exam's day and times in its time zone, for the strings' {weekday}, {day}, {month}, {time} and
 * {lobby}. Only numbers come from Intl: the Edge Runtime's ICU has no Kazakh names (it writes
 * "October 9" for kk-KZ), so the catalog's selects name the weekday and the month in each language.
 */
export function inviteTimes(exam: InviteExam) {
  const zone = exam.timeZone;
  const start = new Date(exam.startsAt);
  const parts: Record<string, string> = {};
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: zone,
  }).formatToParts(start);
  for (const part of formatted) parts[part.type] = part.value;
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  });
  const weekday = WEEKDAYS.find((name) => (parts.weekday ?? "").toLowerCase().startsWith(name));
  const month = MONTHS[Number(parts.month) - 1];
  if (weekday === undefined || month === undefined || parts.day === undefined) {
    throw new Error(`cannot read the exam's date in ${zone}`);
  }
  return {
    weekday,
    day: parts.day,
    month,
    time: clock.format(start),
    lobby: clock.format(new Date(exam.lobbyOpensAt)),
  };
}

// Where the student's own values go in a rendered template. Private-use characters: they never occur
// in a name, React and html-to-text leave them alone, and the subject holds none of them.
const SLOT = { name: "name", number: "number", group: "group" } as const;

/** React's escaping of text, so a filled template matches a direct render byte for byte. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

const page: CSSProperties = {
  margin: 0,
  padding: `${space["24"]}px 0`,
  backgroundColor: color["bg-subtle"],
  fontFamily: SANS,
  color: color["text-primary"],
  WebkitTextSizeAdjust: "100%",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: "600px",
  backgroundColor: color["bg-surface"],
  borderRadius: `${radius.card}px`,
  padding: `${space["24"]}px ${space["32"]}px`,
  boxSizing: "border-box",
};

/** A paragraph with no inbox default margin. */
function Line({
  style,
  className,
  children,
}: {
  style: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Text
      className={className}
      style={{ margin: 0, fontFamily: SANS, color: color["text-primary"], ...style }}
    >
      {children}
    </Text>
  );
}

/** A vertical gap between blocks: 0.8 stacks its blocks 16 px apart. */
function Gap({ height }: { height: number }) {
  return (
    <Section data-skip-in-text="true">
      <Row>
        <Column style={{ height: `${height}px`, fontSize: "1px", lineHeight: `${height}px` }}>&nbsp;</Column>
      </Row>
    </Section>
  );
}

interface InviteProps {
  locale: EmailLocale;
  t: (key: EmailKey, args?: MessageArgs) => string;
  exam: InviteExam;
  student: InviteStudent;
  settings: InviteSettings;
}

function InviteEmail({ locale, t, exam, student, settings }: InviteProps) {
  const times = inviteTimes(exam);
  const image = (name: keyof typeof EMAIL_IMAGES) =>
    settings.assetsUrl === null ? null : `${settings.assetsUrl}/${EMAIL_IMAGES[name].file}`;
  const wordmark = image("wordmark");
  const mascot = image("mascot");
  const lock = image("lock");
  const footer =
    student.group === null
      ? t("email.invite.footer_roster", { name: student.name, office: settings.office })
      : t("email.invite.footer_group", { name: student.name, office: settings.office, group: student.group });
  const steps = [
    t("email.invite.step_install"),
    t("email.invite.step_check", { weekday: times.weekday }),
    t("email.invite.step_join", { lobby: times.lobby }),
  ];

  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <style>{PHONE_CSS}</style>
      </Head>
      <Preview>{t("email.invite.preview", { code: exam.code, lobby: times.lobby })}</Preview>
      <Body style={page}>
        <Container style={card} className="uki-card">
          {/* Top: the wordmark and the three languages */}
          <Row>
            <Column style={{ width: "50%", verticalAlign: "middle" }}>
              {wordmark === null ? (
                <Line style={{ ...type.label, fontWeight: 700 }}>{t("email.invite.wordmark_alt")}</Line>
              ) : (
                <Img
                  src={wordmark}
                  width={EMAIL_IMAGES.wordmark.width}
                  height={EMAIL_IMAGES.wordmark.height}
                  alt={t("email.invite.wordmark_alt")}
                />
              )}
            </Column>
            <Column align="right" style={{ width: "50%", verticalAlign: "middle", textAlign: "right" }}>
              <Line style={{ ...type.label, color: color["text-accent"] }}>
                {t("email.invite.languages")}
              </Line>
            </Column>
          </Row>
          <Gap height={space["16"]} />

          {/* Hero: the mascot, when and what */}
          <Section
            className="uki-hero"
            style={{
              backgroundColor: color["bg-brand-subtle"],
              borderRadius: `${radius.card}px`,
              padding: `${space["20"]}px ${space["24"]}px ${space["20"]}px ${space["20"]}px`,
            }}
          >
            <Row>
              {mascot === null ? null : (
                <Column className="uki-mascot-cell" style={{ width: "110px", verticalAlign: "middle" }}>
                  <Img
                    className="uki-mascot"
                    src={mascot}
                    width={EMAIL_IMAGES.mascot.width}
                    height={EMAIL_IMAGES.mascot.height}
                    alt=""
                  />
                </Column>
              )}
              <Column style={{ verticalAlign: "middle" }}>
                <Line className="uki-title" style={type.title}>
                  {t("email.invite.title", { weekday: times.weekday, time: times.time })}
                </Line>
                <Line
                  style={{
                    ...type.body,
                    paddingTop: "6px",
                    color: over(color["text-primary"], color["bg-brand-subtle"], 0.75),
                  }}
                >
                  {t("email.invite.subtitle", {
                    exam: exam.title,
                    day: times.day,
                    month: times.month,
                    lobby: times.lobby,
                  })}
                </Line>
              </Column>
            </Row>
          </Section>
          <Gap height={space["16"]} />

          {/* The exam code and the student ID */}
          <Section
            className="uki-code"
            style={{
              border: `1.5px dashed ${color["border-strong"]}`,
              borderRadius: `${radius.md}px`,
              padding: `${space["16"]}px 18px`,
            }}
          >
            <Row>
              <Column style={{ verticalAlign: "top" }}>
                <Line style={{ ...type.tag, color: over(color["text-primary"], color["bg-surface"], 0.6) }}>
                  {t("email.invite.code_label")}
                </Line>
                <Line className="uki-code-value" style={{ ...type.title, paddingTop: "4px" }}>
                  {exam.code}
                </Line>
              </Column>
              <Column style={{ width: "16px" }} />
              <Column style={{ verticalAlign: "top", whiteSpace: "nowrap", width: "1%" }}>
                <Line style={{ ...type.tag, color: over(color["text-primary"], color["bg-surface"], 0.6) }}>
                  {t("email.invite.id_label")}
                </Line>
                <Line className="uki-code-value" style={{ ...type.title, paddingTop: "4px" }}>
                  {student.number}
                </Line>
              </Column>
            </Row>
          </Section>
          <Gap height={space["16"]} />

          {/* Three steps */}
          {steps.map((step, index) => (
            <Section key={step} style={{ paddingTop: index === 0 ? 0 : `${space["12"]}px` }}>
              <Row>
                <Column style={{ width: "26px", verticalAlign: "middle" }}>
                  <Line
                    style={{
                      ...type.label,
                      width: "26px",
                      height: "26px",
                      lineHeight: "26px",
                      textAlign: "center",
                      borderRadius: `${radius.pill}px`,
                      backgroundColor: color["bg-brand"],
                      color: color["text-on-brand"],
                    }}
                  >
                    {String(index + 1)}
                  </Line>
                </Column>
                <Column style={{ width: `${space["12"]}px` }} />
                <Column style={{ verticalAlign: "middle" }}>
                  <Line style={type.body}>{step}</Line>
                </Column>
              </Row>
            </Section>
          ))}
          <Gap height={space["16"]} />

          {/* Download */}
          <Button
            href={settings.downloadUrl}
            style={{
              ...type.labelM,
              fontFamily: SANS,
              display: "inline-block",
              backgroundColor: color["bg-inverse"],
              color: color["text-inverse"],
              borderRadius: `${radius.pill}px`,
              padding: "12px 22px",
              textDecoration: "none",
            }}
          >
            {t("email.invite.download")}
          </Button>
          <Gap height={space["16"]} />

          {/* Privacy */}
          <Row>
            {lock === null ? null : (
              <Column style={{ width: "24px", verticalAlign: "middle" }}>
                <Img src={lock} width={EMAIL_IMAGES.lock.width} height={EMAIL_IMAGES.lock.height} alt="" />
              </Column>
            )}
            <Column style={{ verticalAlign: "middle" }}>
              <Line style={type.caption}>{t("email.invite.privacy")}</Line>
            </Column>
          </Row>
          <Gap height={space["16"]} />

          {/* Footer */}
          <Line style={{ ...type.caption, color: over(color["text-primary"], color["bg-surface"], 0.55) }}>
            {footer}
          </Line>
        </Container>
      </Body>
    </Html>
  );
}

function translator(locale: EmailLocale) {
  return (key: EmailKey, args?: MessageArgs) => formatEmailMessage(locale, key, args);
}

function subjectOf(locale: EmailLocale, exam: InviteExam, test: boolean): string {
  return formatEmailMessage(locale, test ? "email.invite.test_subject" : "email.invite.subject", {
    exam: exam.title,
  });
}

/** The plain-text part: the same content, links written out, images and the preview line left out. */
export function plainText(html: string): string {
  return toPlainText(html, { wordwrap: false }).trim();
}

/** One email for one student, rendered directly. */
export async function renderInvite(
  locale: EmailLocale,
  exam: InviteExam,
  student: InviteStudent,
  settings: InviteSettings,
): Promise<RenderedEmail> {
  const html = await render(
    <InviteEmail locale={locale} t={translator(locale)} exam={exam} student={student} settings={settings} />,
  );
  return { subject: subjectOf(locale, exam, settings.test), html, text: plainText(html) };
}

/** A language's email with markers for the student's name, number and group. */
export interface InviteTemplate extends RenderedEmail {
  withGroup: boolean;
}

export async function renderInviteTemplate(
  locale: EmailLocale,
  exam: InviteExam,
  withGroup: boolean,
  settings: InviteSettings,
): Promise<InviteTemplate> {
  const marked: InviteStudent = {
    name: SLOT.name,
    number: SLOT.number,
    group: withGroup ? SLOT.group : null,
  };
  return { ...(await renderInvite(locale, exam, marked, settings)), withGroup };
}

/** The template with one student's values: escaped in the HTML, as typed in the text. */
export function fillInvite(template: InviteTemplate, student: InviteStudent): RenderedEmail {
  if ((student.group !== null) !== template.withGroup)
    throw new Error("the template's group line does not fit");
  const fill = (source: string, encode: (value: string) => string) =>
    source
      .replaceAll(SLOT.name, encode(student.name))
      .replaceAll(SLOT.number, encode(student.number))
      .replaceAll(SLOT.group, encode(student.group ?? ""));
  return {
    subject: template.subject,
    html: fill(template.html, escapeHtml),
    text: fill(template.text, (value) => value),
  };
}

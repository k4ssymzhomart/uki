import type { DesktopOs } from "@uki/contracts";
import { formatTime, type Locale } from "@uki/i18n";
import { Banner, Button, CheckRow, type CheckRowStatus, shortName } from "@uki/ui";
import { type ReactNode, useId } from "react";
import { useTranslations } from "use-intl";
import type { IdentityModel, IdentityRowState } from "../../flow/view-model.ts";
import { NoticeBanners } from "../exam/notice-banners.tsx";
import idScan from "../shared/assets/uki-3d-id-scan.png";
import { CameraPreview, DashedFrame, FaceFrame, PREVIEW_ASPECT } from "../shared/camera-preview.tsx";
import { CheckInStepper } from "../shared/check-in-stepper.tsx";
import { coverRect, rectStyle } from "../shared/format.ts";
import { ScreenFrame } from "../shared/screen-frame.tsx";
import { useScreenLocale } from "../shared/use-screen-env.ts";

/** The camera picture is 640 × 480. */
const CAMERA_ASPECT = 640 / 480;

/** Figma 1.3: the face frame at 150, 70, 170 × 200 in the 520 × 420 preview. */
const FACE_FRAME = { x: 150 / 520, y: 70 / 420, width: 170 / 520, height: 200 / 420 };

export type IdentityScreenProps = {
  model: IdentityModel;
  /** The live preview (a <video> from the flow); nothing in it is uploaded. */
  camera?: ReactNode;
  /** Width / height of the camera picture behind `camera`, to place the card frame (default 4:3). */
  cameraAspect?: number;
  /** The preview is drawn mirrored (selfie view): flip the card frame with it. */
  mirrored?: boolean;
  onContinue: () => void;
  /** 1.3 only: opens 1.3a and asks the proctor for help. */
  onAskProctor: () => void;
  /** Got it on a proctor's message over 1.3 or 1.3a (2.1e's banner). */
  onGotIt?: () => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

const ROW_STATUS: Record<IdentityRowState, CheckRowStatus> = { ok: "pass", fail: "fail", pending: "running" };

/**
 * 1.3 Identity and 1.3a Proctor help (Figma 51:2062, 151:11547): face, student card and one-person rows
 * beside the preview with the lime frames. Ask proctor is the only one in Phase 0. Phase 1: a proctor's
 * message (a reply, or a 1.5b hint) shows as 2.1e's banner above the help banner, until Got it.
 */
export function IdentityScreen({
  model,
  camera,
  cameraAspect = CAMERA_ASPECT,
  mirrored = false,
  onContinue,
  onAskProctor,
  onGotIt = () => {},
  onLanguage,
  os,
}: IdentityScreenProps) {
  const t = useTranslations();
  const locale = useScreenLocale(model.locale);
  const headingId = useId();
  const help = model.frame === "1.3a" ? model.help : null;
  const helpMode = model.frame === "1.3a";
  const card = rectStyle(coverRect(model.cardRect, cameraAspect, PREVIEW_ASPECT, mirrored));

  function chip(state: IdentityRowState, failKey: "status.fix" | "status.needs_help" = "status.fix") {
    if (state === "ok") return t("status.ready");
    if (state === "pending") return t("status.checking");
    return t(failKey);
  }

  const { face, card: cardRow, person } = model.rows;
  const proctor = help?.proctorName ?? null;

  return (
    <ScreenFrame
      frame={model.frame}
      locale={model.locale}
      titleBar={model.titleBar}
      os={os}
      onLanguage={onLanguage}
      className="flex-col gap-7 overflow-clip px-14 pt-9 pb-10"
    >
      <CheckInStepper step={model.step} />
      <div className="flex min-h-0 w-full flex-1 gap-10">
        <section className="flex w-100 shrink-0 flex-col gap-3 overflow-y-auto xl:w-130">
          <CameraPreview camera={camera}>
            <FaceFrame size="identity" rect={FACE_FRAME} />
            <DashedFrame style={card} className="rounded-[calc(var(--radius-md)-var(--spacing)/2)]" />
            <p className="-translate-x-1/2 absolute bottom-4.5 left-1/2 overflow-clip whitespace-nowrap rounded-pill bg-inverse px-3.5 py-2 text-fg-inverse opacity-90 type-mono-s">
              {helpMode ? t("identity.help.hint") : t("identity.hint")}
            </p>
          </CameraPreview>
          <p className="opacity-58 type-card-caption">{t("identity.caption")}</p>
        </section>
        <section aria-labelledby={headingId} className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto">
          <div className="flex w-full shrink-0 items-center gap-4.5">
            <img src={idScan} alt="" draggable={false} className="size-24 shrink-0 object-contain" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 id={headingId} className="type-h3">
                {helpMode ? t("identity.help.title") : t("identity.title")}
              </h1>
              <p className="opacity-62 type-body-s">
                {helpMode ? t("identity.help.body", { tries: model.tries }) : t("identity.subtitle")}
              </p>
            </div>
          </div>
          <div aria-hidden="true" className="h-2 shrink-0" />
          <CheckRow
            status={ROW_STATUS[face]}
            title={t("identity.face.title")}
            detail={
              face === "ok" ? t("identity.face.ok") : face === "fail" ? t("identity.face.fail") : undefined
            }
            statusLabel={chip(face)}
            className="w-full"
          />
          <CheckRow
            status={ROW_STATUS[cardRow]}
            title={t("identity.card.title")}
            detail={
              cardRow === "pending"
                ? t("identity.card.running")
                : cardRow === "fail"
                  ? t("identity.card.failed", { n: model.tries, total: model.maxTries })
                  : undefined
            }
            statusLabel={chip(cardRow, helpMode ? "status.needs_help" : "status.fix")}
            className="w-full"
          />
          <CheckRow
            status={ROW_STATUS[person]}
            title={t("identity.person.title")}
            detail={
              person === "ok"
                ? t("identity.person.ok")
                : person === "fail"
                  ? t("identity.person.fail")
                  : undefined
            }
            statusLabel={chip(person)}
            className="w-full"
          />
          {model.notice?.message ? (
            <NoticeBanners notice={model.notice} offline={null} locale={locale} onGotIt={onGotIt} />
          ) : null}
          {help === null ? (
            helpMode ? null : (
              <p className="opacity-58 type-card-caption">{t("identity.privacy")}</p>
            )
          ) : (
            <Banner
              kind="info"
              title={t("identity.help.requested", { time: formatTime(help.requestedAt, locale) })}
              body={proctor === null ? undefined : t("identity.help.privacy", { proctor })}
            />
          )}
          <div className="flex shrink-0 gap-3 overflow-clip pt-2.5">
            {helpMode ? (
              <Button variant="secondary" loading>
                {proctor === null
                  ? t("identity.help.title")
                  : t("identity.help.waiting", { proctor: shortName(proctor) })}
              </Button>
            ) : (
              <Button variant="ghost" onClick={onAskProctor}>
                {t("action.ask_proctor")}
              </Button>
            )}
            <Button disabled={!model.canContinue} onClick={onContinue}>
              {t("action.continue")}
            </Button>
          </div>
        </section>
      </div>
    </ScreenFrame>
  );
}

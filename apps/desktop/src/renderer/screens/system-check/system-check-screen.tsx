import type { DesktopOs } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { Button, CheckRow, type CheckRowStatus, Chip } from "@uki/ui";
import { type ReactNode, useId } from "react";
import { useFormatter, useTranslations } from "use-intl";
import type { CheckStatus, SystemCheckModel } from "../../flow/view-model.ts";
import { CameraPreview, FaceFrame } from "../shared/camera-preview.tsx";
import { CheckInStepper } from "../shared/check-in-stepper.tsx";
import { ScreenFrame } from "../shared/screen-frame.tsx";

export type SystemCheckScreenProps = {
  model: SystemCheckModel;
  /** The live preview (a <video> from the flow); it never leaves the laptop. */
  camera?: ReactNode;
  onCheckAgain: () => void;
  onContinue: () => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

/** Figma 1.2: the face frame at 165, 60, 190 × 220 in the 520 × 420 preview. */
const FACE_FRAME = { x: 165 / 520, y: 60 / 420, width: 190 / 520, height: 220 / 420 };

const ROW_STATUS: Record<CheckStatus, CheckRowStatus> = { checking: "running", ready: "pass", fail: "fail" };

const CHIP_KEY = {
  checking: "status.checking",
  ready: "status.ready",
  fail: "status.fix",
} as const satisfies Record<CheckStatus, string>;

/** 1.2 System check (Figma 51:2060): seven rows, Check again, and Continue once every row is ready. */
export function SystemCheckScreen({
  model,
  camera,
  onCheckAgain,
  onContinue,
  onLanguage,
  os,
}: SystemCheckScreenProps) {
  const t = useTranslations();
  const format = useFormatter();
  const headingId = useId();

  function row(
    status: CheckStatus,
    title: string,
    details: Partial<Record<CheckStatus, string>>,
    compact = false,
  ) {
    return (
      <CheckRow
        status={ROW_STATUS[status]}
        title={title}
        detail={details[status]}
        statusLabel={t(CHIP_KEY[status])}
        className={compact ? "w-full py-2.5" : "w-full"}
      />
    );
  }

  const { camera: cam, network, version, browserLock, apps, screenShare, storage } = model;
  const faces = cam.faces;

  return (
    <ScreenFrame
      frame={model.frame}
      locale={model.locale}
      titleBar={model.titleBar}
      os={os}
      onLanguage={onLanguage}
      className="flex-col gap-7 overflow-clip px-14 pt-9 pb-10"
    >
      <CheckInStepper step={model.step} lineTone="strong" />
      <div className="flex min-h-0 w-full flex-1 gap-10">
        <section className="flex w-100 shrink-0 flex-col gap-2.5 overflow-y-auto xl:w-130">
          <CameraPreview camera={camera}>
            <FaceFrame size="check" rect={FACE_FRAME} />
            <p className="absolute top-4 left-4 flex items-center gap-1.5 overflow-clip rounded-pill bg-inverse px-2.5 py-1.25 text-fg-inverse type-mono-s">
              <span aria-hidden="true" className="size-1.75 rounded-pill bg-brand" />
              {t("check.preview.badge")}
            </p>
            {faces !== null && cam.status === "ready" ? (
              <Chip status="ok" className="absolute bottom-4 left-4">
                {t("check.preview.status", { count: faces })}
              </Chip>
            ) : null}
          </CameraPreview>
          <p className="type-card-caption">{t("check.preview.caption")}</p>
          {row(
            network.status,
            t("check.network.title"),
            {
              ready:
                network.ms === null ? undefined : t("check.network.ok", { ms: format.number(network.ms) }),
              fail: t("check.network.fail"),
            },
            true,
          )}
          {row(
            version.status,
            t("check.version.title"),
            { ready: t("check.version.ok", { version: version.version }) },
            true,
          )}
        </section>
        <section aria-labelledby={headingId} className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto">
          <h1 id={headingId} className="whitespace-nowrap type-h3">
            {t("check.title")}
          </h1>
          <p className="type-body-s">{t("check.subtitle")}</p>
          <div aria-hidden="true" className="h-1.5 shrink-0" />
          {row(cam.status, t("check.camera.title"), {
            ready: t("check.camera.ok"),
            fail: t("check.camera.fail"),
          })}
          {row(browserLock.status, t("check.browser.title"), {
            ready: t("check.browser.ok"),
            fail: t("check.browser.fail"),
          })}
          {row(apps.status, t("check.apps.title"), {
            fail: apps.app === null ? undefined : t("check.apps.fail", { app: apps.app }),
          })}
          {row(screenShare.status, t("check.screen.title"), {
            ready: t("check.screen.ok"),
            fail: screenShare.app === null ? undefined : t("check.screen.fail", { app: screenShare.app }),
          })}
          {row(storage.status, t("check.storage.title"), {
            checking: t("check.storage.running"),
            ready:
              storage.freeGb === null
                ? undefined
                : t("check.storage.ok", {
                    free: format.number(storage.freeGb, { maximumFractionDigits: 1 }),
                  }),
            fail: t("check.storage.fail"),
          })}
          <div className="flex shrink-0 gap-3 overflow-clip pt-2.5">
            <Button variant="secondary" loading={model.rechecking} onClick={onCheckAgain}>
              {t("check.again")}
            </Button>
            <Button disabled={!model.canContinue} onClick={onContinue}>
              {t("action.continue")}
            </Button>
          </div>
        </section>
      </div>
    </ScreenFrame>
  );
}

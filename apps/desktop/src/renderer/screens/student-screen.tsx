import type { DesktopOs } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import type { ReactNode } from "react";
import type { FlowUiEvent, ScreenModel } from "../flow/view-model.ts";
import { ExamScreen } from "./exam/exam-screen.tsx";
import { IdentityScreen } from "./identity/identity-screen.tsx";
import { JoinScreen } from "./join/join-screen.tsx";
import { EndedScreen } from "./receipt/ended-screen.tsx";
import { SubmittedScreen } from "./receipt/submitted-screen.tsx";
import { RulesScreen } from "./rules/rules-screen.tsx";
import { SystemCheckScreen } from "./system-check/system-check-screen.tsx";

export type StudentScreenProps = {
  /** What the flow shows now (useStudentFlow). */
  model: ScreenModel;
  /** Back to the flow: every button and the language switch become a FlowUiEvent. */
  send: (event: FlowUiEvent) => void;
  /** The live camera preview for 1.2, 1.3 and 2.1 to 2.3 (a <video> the flow owns). */
  camera?: ReactNode;
  /** Mirror the 1.3 card frame when the preview is drawn as a selfie view. */
  cameraMirrored?: boolean;
  /** Window chrome; window.uki.app.info() when absent. */
  os?: DesktopOs;
};

/** The student window: the frame component for the model, wired to the flow's events. */
export function StudentScreen({ model, send, camera, cameraMirrored, os }: StudentScreenProps) {
  const onLanguage = (locale: Locale) => send({ type: "SET_LOCALE", locale });
  switch (model.frame) {
    case "1.1":
    case "1.1a":
      return (
        <JoinScreen
          model={model}
          os={os}
          onLanguage={onLanguage}
          onJoin={(code, studentNumber) => send({ type: "JOIN", code, studentNumber })}
        />
      );
    case "1.2":
      return (
        <SystemCheckScreen
          model={model}
          camera={camera}
          os={os}
          onLanguage={onLanguage}
          onCheckAgain={() => send({ type: "CHECK_AGAIN" })}
          onContinue={() => send({ type: "CONTINUE" })}
        />
      );
    case "1.3":
    case "1.3a":
      return (
        <IdentityScreen
          model={model}
          camera={camera}
          mirrored={cameraMirrored}
          os={os}
          onLanguage={onLanguage}
          onContinue={() => send({ type: "CONTINUE" })}
          onAskProctor={() => send({ type: "ASK_PROCTOR" })}
          onGotIt={() => send({ type: "ACK_NOTICE" })}
        />
      );
    case "1.4":
      return (
        <RulesScreen
          model={model}
          os={os}
          onLanguage={onLanguage}
          onAgree={(agreed) => send({ type: "SET_AGREED", agreed })}
        />
      );
    case "3.1":
      return (
        <SubmittedScreen
          model={model}
          os={os}
          onLanguage={onLanguage}
          onSavePdf={() => send({ type: "SAVE_RECEIPT" })}
          onQuit={() => send({ type: "CLOSE_APP" })}
        />
      );
    case "2.1d":
      return (
        <EndedScreen
          model={model}
          os={os}
          onLanguage={onLanguage}
          onSavePdf={() => send({ type: "SAVE_RECEIPT" })}
          onQuit={() => send({ type: "CLOSE_APP" })}
        />
      );
    default:
      return (
        <ExamScreen
          model={model}
          camera={camera}
          os={os}
          onLanguage={onLanguage}
          onSelectChoice={(questionId, choiceId) => send({ type: "SELECT_CHOICE", questionId, choiceId })}
          onNext={() => send({ type: "NEXT_QUESTION" })}
          onBack={() => send({ type: "PREV_QUESTION" })}
          onSubmit={() => send({ type: "SUBMIT" })}
          onImHere={() => send({ type: "IM_HERE" })}
          onGotIt={() => send({ type: "ACK_NOTICE" })}
          onRetryQuestions={() => send({ type: "RETRY_QUESTIONS" })}
          onAskHelp={(topic, text) => send({ type: "ASK_HELP", topic, text })}
          onHelpGotIt={() => send({ type: "ACK_HELP" })}
        />
      );
  }
}

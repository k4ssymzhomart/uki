// The student window: the frame the flow is on (StudentScreen picks the screen for the ScreenModel and
// turns its buttons into flow events), the live camera preview the flow owns, and the pairing card
// while Üki Lock waits for its code (E.3).
import { useSelector } from "@xstate/react";
import { CAMERA_PREVIEW_MIRRORED, CameraPreview, useFlowRuntime, useStudentFlow } from "../flow/index.ts";
import { StudentScreen } from "../screens/index.ts";
import { samePairing, selectPairing } from "./pairing.ts";
import { PairingCard } from "./pairing-card.tsx";

/** The pairing card on its own, so the clock tick re-renders only it. */
function PairingLayer() {
  const runtime = useFlowRuntime();
  const pairing = useSelector(runtime.actor, selectPairing, samePairing);
  const now = useSelector(runtime.actor, (snapshot) => (pairing ? snapshot.context.now : 0));
  return pairing ? <PairingCard pairing={pairing} now={now} /> : null;
}

export function StudentWindow() {
  const { state, send } = useStudentFlow();
  return (
    <div className="relative h-full w-full">
      <StudentScreen
        model={state}
        send={send}
        camera={<CameraPreview />}
        cameraMirrored={CAMERA_PREVIEW_MIRRORED}
      />
      <PairingLayer />
    </div>
  );
}

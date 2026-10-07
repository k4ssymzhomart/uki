// The student flow for the screens and the app root:
//   <UkiIntlProvider><FlowProvider><DevOverlay /><Screens /></FlowProvider></UkiIntlProvider>
//   const { state, send } = useStudentFlow();   // state: ScreenModel (view-model.ts)

export { CAMERA_PREVIEW_MIRRORED, CameraPreview } from "../detection/camera-preview.tsx";
export { DevOverlay } from "../overlay/dev-overlay.tsx";
export {
  FlowProvider,
  type FlowProviderProps,
  useCameraStream,
  useDetectionDebug,
  useFlowRuntime,
  useStudentFlow,
} from "./provider.tsx";
export * from "./view-model.ts";

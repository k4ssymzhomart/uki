// What other dashboard features reuse from the live wall. The lobby (1.5) opens 2.4b for the group
// with <QuickMessage target={{ scope: "group", examId, label }} trigger={<Button …/>} />.
export {
  type CallErrorCode,
  type CallResult,
  createFunctionsClient,
  type FunctionsClient,
} from "./functions-client.ts";
export { type MessageTarget, messageRequest, presetsFor } from "./message-target.ts";
export { QuickMessage, type QuickMessageProps, useQuickMessageContent } from "./quick-message.tsx";
export { FunctionsClientContext, useCommand } from "./use-command.ts";
export { WriteMessageDialog, type WriteMessageDialogProps } from "./write-message-dialog.tsx";

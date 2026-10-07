// The student screens (WP 0.6): one component per Figma frame group, each taking its ScreenModel
// variant from flow/view-model.ts. StudentScreen picks the right one and turns its callbacks into
// FlowUiEvents. The gallery (screens.gallery.tsx) is development only and is imported lazily.
export { ExamScreen, type ExamScreenProps } from "./exam/exam-screen.tsx";
export { IdentityScreen, type IdentityScreenProps } from "./identity/identity-screen.tsx";
export { JoinScreen, type JoinScreenProps } from "./join/join-screen.tsx";
export { EndedScreen, type EndedScreenProps } from "./receipt/ended-screen.tsx";
export { RECEIPT_PRINT_ATTRIBUTE } from "./receipt/receipt-card.tsx";
export { SubmittedScreen, type SubmittedScreenProps } from "./receipt/submitted-screen.tsx";
export { RulesScreen, type RulesScreenProps } from "./rules/rules-screen.tsx";
export { StudentScreen, type StudentScreenProps } from "./student-screen.tsx";
export { SystemCheckScreen, type SystemCheckScreenProps } from "./system-check/system-check-screen.tsx";

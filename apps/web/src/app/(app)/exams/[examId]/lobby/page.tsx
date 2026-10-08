import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadLobby } from "../../../../../features/lobby/lobby-data.ts";
import { LobbyView } from "../../../../../features/lobby/lobby-view.tsx";
import { StaffLookupFailed } from "../../../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../../../lib/auth.ts";
import { startExam } from "./actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.lobby");
  return { title: t("title") };
}

/**
 * 1.5 Lobby (Figma 51:2066) with 1.5a and 1.5b, for proctors of the exam and the exam office, rendered
 * on the server under RLS; an exam the staff member may not see is a 404. The exam office also gets the
 * proctors' change requests from 0.9a.
 */
export default async function LobbyPage({ params }: PageProps<"/exams/[examId]/lobby">) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  const { examId } = await params;
  const lobby = await loadLobby(examId, staff);
  if (!lobby) notFound();
  return (
    <LobbyView
      exam={lobby.exam}
      roster={lobby.roster}
      sessions={lobby.sessions}
      who={lobby.who}
      changeRequests={lobby.changeRequests}
      nowMs={Date.now()}
      startAction={startExam}
    />
  );
}

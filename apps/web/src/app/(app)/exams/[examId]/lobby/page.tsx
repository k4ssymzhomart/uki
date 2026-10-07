import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadLobby } from "../../../../../features/lobby/lobby-data.ts";
import { LobbyView } from "../../../../../features/lobby/lobby-view.tsx";
import { requireStaff } from "../../../../../lib/auth.ts";
import { startExam } from "./actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.lobby");
  return { title: t("title") };
}

/**
 * 1.5 Lobby (Figma 51:2066) for proctors of the exam and the exam office, rendered on the server under
 * RLS; an exam the staff member may not see is a 404.
 */
export default async function LobbyPage({ params }: PageProps<"/exams/[examId]/lobby">) {
  const staff = await requireStaff();
  const { examId } = await params;
  const lobby = await loadLobby(examId, staff);
  if (!lobby) notFound();
  return (
    <LobbyView
      exam={lobby.exam}
      roster={lobby.roster}
      sessions={lobby.sessions}
      who={lobby.who}
      nowMs={Date.now()}
      startAction={startExam}
    />
  );
}

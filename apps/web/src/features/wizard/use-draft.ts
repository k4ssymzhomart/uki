"use client";

import type { ExamDraft } from "@uki/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveExamDraft, type WizardError } from "./wizard-actions.ts";
import { applyPatch, mergePatch, type DraftPatch as Patch } from "./wizard-model.ts";

export type DraftState = {
  exam: ExamDraft;
  /** When the last save landed (ISO), or the draft's creation before the first one. */
  savedAt: string | null;
  error: WizardError | null;
  saving: boolean;
  /** Changes the page at once and saves after `delay` ms; typing keeps pushing the save back. */
  update: (patch: Patch, delay?: number) => void;
  /** Saves what is waiting now; resolves false when the save failed. */
  flush: () => Promise<boolean>;
  /** True from Next or Back until the next page opens. */
  leaving: boolean;
  /** Next and Back: saves what is waiting, then opens `href`; stays when the save failed. */
  leave: (href: string) => Promise<void>;
};

/**
 * Every wizard step saves into the one draft row (plan, Decisions: Wizard state): each change goes to
 * save_exam_draft after a short pause, Next and Back wait for it, and leaving the page sends what is
 * left, so a refresh or a second tab loses nothing.
 */
export function useDraft(initial: ExamDraft, initialSavedAt: string | null, delayMs = 500): DraftState {
  const [exam, setExam] = useState(initial);
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [error, setError] = useState<WizardError | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const examId = initial.id;

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return chain.current;
    pending.current = {};
    setSaving(true);
    const run = chain.current.then(async () => {
      const result = await saveExamDraft({ exam: { id: examId, ...patch } });
      if (result.ok) {
        setSavedAt(result.savedAt);
        setError(null);
        // Keep what the page shows (a later change may be on its way); take only the lobby time, which
        // the database works out from the start and the workspace's lobby minutes.
        setExam((current) => ({ ...current, lobby_opens_at: result.exam.lobby_opens_at }));
      } else {
        setError(result.error);
      }
      setSaving(Object.keys(pending.current).length > 0);
      return result.ok;
    });
    chain.current = run.catch(() => false);
    return chain.current;
  }, [examId]);

  const update = useCallback(
    (patch: Patch, delay = delayMs) => {
      setExam((current) => applyPatch(current, patch));
      pending.current = mergePatch(pending.current, patch);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delay);
    },
    [delayMs, flush],
  );

  useEffect(() => {
    const leave = () => {
      void flush();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [flush]);

  const leave = useCallback(
    async (href: string) => {
      setLeaving(true);
      if (await flush()) router.push(href as Route);
      else setLeaving(false);
    },
    [flush, router],
  );

  return { exam, savedAt, error, saving, update, flush, leaving, leave };
}

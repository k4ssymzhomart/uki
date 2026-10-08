"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long the pointer rests on a row before its card opens, and how long the card waits to close. */
export const HOVER_OPEN_MS = 300;
export const HOVER_CLOSE_MS = 200;

export type HoverCard = {
  /** The row whose card is open. */
  openId: string | null;
  /**
   * True when the pointer opened the card (or, after it closed, opened the last one): such a card keeps
   * the focus where it was, when it opens and when it closes, and closes when the pointer leaves.
   */
  byHover: boolean;
  /** Mouse handlers for a row. */
  rowHandlers: (id: string) => { onMouseEnter: () => void; onMouseLeave: () => void };
  /** Mouse handlers for the open card, so moving onto it keeps it open. */
  cardHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
  /** Opens or closes a row's card from a click, Enter or Space, Escape or a click outside. */
  setOpen: (id: string, open: boolean) => void;
};

/**
 * One hover card at a time over a list of rows (1.5a on the lobby): resting the pointer on a row opens
 * its card after HOVER_OPEN_MS; leaving the row and the card closes a card the pointer opened after
 * HOVER_CLOSE_MS. A card opened by click or keyboard stays until Escape, a click outside or a second
 * click.
 */
export function useHoverCard(openMs = HOVER_OPEN_MS, closeMs = HOVER_CLOSE_MS): HoverCard {
  const [state, setState] = useState<{ openId: string | null; byHover: boolean }>({
    openId: null,
    byHover: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clear, [clear]);

  const scheduleClose = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      setState((current) => (current.byHover ? { openId: null, byHover: true } : current));
    }, closeMs);
  }, [clear, closeMs]);

  const rowHandlers = useCallback(
    (id: string) => ({
      onMouseEnter: () => {
        clear();
        timer.current = setTimeout(() => {
          setState((current) =>
            current.openId === id || (current.openId !== null && !current.byHover)
              ? current
              : { openId: id, byHover: true },
          );
        }, openMs);
      },
      onMouseLeave: scheduleClose,
    }),
    [clear, openMs, scheduleClose],
  );

  const setOpen = useCallback(
    (id: string, open: boolean) => {
      clear();
      setState((current) => {
        if (open) return { openId: id, byHover: false };
        return current.openId === id ? { openId: null, byHover: false } : current;
      });
    },
    [clear],
  );

  return {
    openId: state.openId,
    byHover: state.byHover,
    rowHandlers,
    cardHandlers: { onMouseEnter: clear, onMouseLeave: scheduleClose },
    setOpen,
  };
}

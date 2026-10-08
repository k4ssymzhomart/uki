"use client";

// The live wall's store for 2.4d, beside the wall's own: open requests, whether the caller answers
// them, and the browser Supabase client for close_help_request. Without a provider (a tile rendered on
// its own in a test) every hook reads an empty list.
import type { HelpRequest } from "@uki/contracts";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { AnyClient } from "../wall/queries.ts";
import { fetchOpenHelp, type HelpInitialData } from "./help-data.ts";
import { applyHelp, type HelpState, initialHelpState, mergeOpenHelp } from "./help-model.ts";

export interface HelpActions {
  /** One `help` message, or the closed request close_help_request answered with. */
  apply: (message: HelpRequest) => void;
  /** A catch-up read of the open requests; `arrived` are ids a message added while it ran. */
  merge: (fetched: readonly HelpRequest[], arrived?: ReadonlySet<string>) => void;
}

export type HelpStoreState = HelpState & { canAnswer: boolean; actions: HelpActions };
export type HelpStore = ReturnType<typeof createHelpStore>;

export function createHelpStore(initial: HelpInitialData) {
  return createStore<HelpStoreState>()((set) => {
    const update = (reducer: (state: HelpState) => HelpState) =>
      set((store) => {
        const next = reducer(store);
        return next === store ? store : { open: next.open, closed: next.closed };
      });
    return {
      ...initialHelpState(initial.requests),
      canAnswer: initial.canAnswer,
      actions: {
        apply: (message) => update((state) => applyHelp(state, message)),
        merge: (fetched, arrived) => update((state) => mergeOpenHelp(state, fetched, arrived)),
      },
    };
  });
}

const EMPTY_STORE = createHelpStore({ requests: [], canAnswer: false });

interface HelpContextValue {
  store: HelpStore;
  /** The browser client once it exists (after hydration); null before. */
  client: AnyClient | null;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({
  initial,
  client,
  children,
}: {
  initial: HelpInitialData;
  client: AnyClient | null;
  children: ReactNode;
}) {
  const [store] = useState(() => createHelpStore(initial));
  return <HelpContext value={{ store, client }}>{children}</HelpContext>;
}

/** The store, or null outside a HelpProvider. */
export function useHelpStoreApi(): HelpStore | null {
  return useContext(HelpContext)?.store ?? null;
}

export function useHelpClient(): AnyClient | null {
  return useContext(HelpContext)?.client ?? null;
}

/** A slice of 2.4d's state; an empty list outside a provider. */
export function useHelp<T>(selector: (state: HelpStoreState) => T): T {
  return useStore(useHelpStoreApi() ?? EMPTY_STORE, selector);
}

/**
 * What the wall's exam channel needs for 2.4d: `help` messages go to the store, and every catch-up
 * re-reads the open requests. A request whose message arrives while that read is in flight stays.
 */
export function useHelpChannel(
  client: AnyClient,
  examId: string,
): { onHelp: (message: HelpRequest) => void; onCatchUp: () => Promise<void> } {
  const store = useHelpStoreApi();
  const arrived = useRef<Set<string> | null>(null);
  const onHelp = useCallback(
    (message: HelpRequest) => {
      arrived.current?.add(message.id);
      store?.getState().actions.apply(message);
    },
    [store],
  );
  const onCatchUp = useCallback(async () => {
    if (store === null) return;
    const during = new Set<string>();
    arrived.current = during;
    try {
      const fetched = await fetchOpenHelp(client, examId);
      if (fetched !== null) store.getState().actions.merge(fetched, during);
    } finally {
      if (arrived.current === during) arrived.current = null;
    }
  }, [store, client, examId]);
  return { onHelp, onCatchUp };
}

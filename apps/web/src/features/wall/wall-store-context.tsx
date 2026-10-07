"use client";

import { createContext, type ReactNode, useContext, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  createWallStore,
  type WallActions,
  type WallInitialData,
  type WallState,
  type WallStore,
} from "./wall-store.ts";

const WallStoreContext = createContext<WallStore | null>(null);

export function WallStoreProvider({
  initial,
  nowMs,
  children,
}: {
  initial: WallInitialData;
  /** The first tick's time; the client passes its server-corrected clock. */
  nowMs: number;
  children: ReactNode;
}) {
  const [store] = useState(() => createWallStore(initial, nowMs));
  return <WallStoreContext.Provider value={store}>{children}</WallStoreContext.Provider>;
}

export function useWallStoreApi(): WallStore {
  const store = useContext(WallStoreContext);
  if (store === null) throw new Error("useWallStore needs a <WallStoreProvider> above it");
  return store;
}

/** A slice of the wall; the component re-renders only when the slice changes (Object.is). */
export function useWall<T>(selector: (state: WallState) => T): T {
  return useStore(useWallStoreApi(), selector);
}

export function useWallActions(): WallActions {
  return useStore(useWallStoreApi(), (state) => state.actions);
}

/**
 * A slice compared with `equal` instead of Object.is: the previous value is returned while `equal`
 * holds, so a tile whose own line did not change keeps the same object and does not re-render.
 */
export function useWallWith<T>(selector: (state: WallState) => T, equal: (a: T, b: T) => boolean): T {
  const previous = useRef<{ value: T } | null>(null);
  return useWall((state) => {
    const next = selector(state);
    if (previous.current !== null && equal(previous.current.value, next)) return previous.current.value;
    previous.current = { value: next };
    return next;
  });
}

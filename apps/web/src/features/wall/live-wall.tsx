"use client";

import { ToastContext, ToastProvider } from "@uki/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useServerOffset } from "../../lib/use-now.ts";
import type { HelpInitialData } from "../help/help-data.ts";
import { HelpProvider, useHelpChannel } from "../help/help-store.tsx";
import { browserSupabase } from "./browser-services.ts";
import { DarkTheme } from "./dark-theme.tsx";
import { LiveEvents } from "./live-events.tsx";
import type { AnyClient } from "./queries.ts";
import type { OrderOptions } from "./tiles.ts";
import { setDrawerSession, TimelineDrawer, useDrawerSession } from "./timeline-drawer.tsx";
import { useExamChannel } from "./use-exam-channel.ts";
import { WallGrid } from "./wall-grid.tsx";
import { WallHeader } from "./wall-header.tsx";
import { WallStats } from "./wall-stats.tsx";
import type { WallInitialData } from "./wall-store.ts";
import { WallStoreProvider } from "./wall-store-context.tsx";
import { WallToolbar, type WallView } from "./wall-toolbar.tsx";

/** Uses the shell's toasts when the layout has them, otherwise brings its own. */
function EnsureToasts({ children }: { children: ReactNode }) {
  const t = useTranslations("dashboard.wall.toast");
  if (useContext(ToastContext) !== null) return children;
  return (
    <ToastProvider label={t("region")} closeLabel={t("close")}>
      {children}
    </ToastProvider>
  );
}

function Channel({ client, examId, offsetMs }: { client: AnyClient; examId: string; offsetMs: number }) {
  useExamChannel({ client, examId, offsetMs, ...useHelpChannel(client, examId) });
  return null;
}

const NO_HELP: HelpInitialData = { requests: [], canAnswer: false };

export interface LiveWallProps {
  initial: WallInitialData;
  /** 2.4d: the open help requests and whether the staff member answers them (help-data.ts). */
  help?: HelpInitialData;
  /** Tests pass a fake; the app uses the browser Supabase client. */
  getClient?: () => AnyClient;
  /** Server clock minus this browser's (lib/use-now.ts); tests pass a fake. Must be stable. */
  measureOffset?: () => Promise<number | null>;
}

/** 2.4 Live wall with 2.4a to 2.4e, 2.4d and the 2.5 drawer, fed by Realtime. */
export function LiveWall({
  initial,
  help = NO_HELP,
  getClient = browserSupabase,
  measureOffset,
}: LiveWallProps) {
  const [client, setClient] = useState<AnyClient | null>(null);
  const [view, setView] = useState<WallView>("flags");
  const drawerSession = useDrawerSession();
  // Measured from a fresh server answer, never from the render time: page load is not clock skew.
  const offsetMs = useServerOffset(measureOffset);

  // Browser-only: the Supabase client is set after hydration.
  useEffect(() => {
    setClient(getClient());
  }, [getClient]);

  const onOpenTimeline = useCallback((sessionId: string) => setDrawerSession(sessionId), []);
  const options: OrderOptions = {
    sort: view === "seat" ? "seat" : "flags",
    filter: view === "paused" ? "paused" : "all",
  };

  return (
    <WallStoreProvider initial={initial} nowMs={initial.serverNowMs}>
      <HelpProvider initial={help} client={client}>
        <EnsureToasts>
          <DarkTheme />
          {client === null ? null : <Channel client={client} examId={initial.exam.id} offsetMs={offsetMs} />}
          <div data-theme="dark" className="flex w-full min-w-0 flex-1 flex-col bg-canvas text-fg-primary">
            <WallHeader />
            <div className="flex w-full flex-col gap-4.5 px-8 pt-6 pb-7">
              <WallStats />
              <WallToolbar view={view} onViewChange={setView} />
              <WallGrid options={options} onOpenTimeline={onOpenTimeline} />
              <LiveEvents />
            </div>
          </div>
          {client === null ? null : <TimelineDrawer client={client} sessionId={drawerSession} />}
        </EnsureToasts>
      </HelpProvider>
    </WallStoreProvider>
  );
}

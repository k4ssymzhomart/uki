"use client";

// Sends proctor commands. The wall never updates on its own guess: the proctor event the command
// writes arrives through the exam channel. A failure shows an error toast and leaves the wall as is.
import type { CommandRequest } from "@uki/contracts";
import { ToastContext } from "@uki/ui";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useState } from "react";
import { browserFunctions } from "./browser-services.ts";
import type { FunctionsClient } from "./functions-client.ts";

/** Tests and stories pass their own client; the app uses the browser one. */
export const FunctionsClientContext = createContext<(() => FunctionsClient) | null>(null);

export function useFunctionsClient(): () => FunctionsClient {
  return useContext(FunctionsClientContext) ?? browserFunctions;
}

export function useCommand(): { send: (request: CommandRequest) => Promise<boolean>; pending: boolean } {
  const getClient = useFunctionsClient();
  const toast = useContext(ToastContext);
  const t = useTranslations("dashboard.wall");
  const [pending, setPending] = useState(false);

  const send = useCallback(
    async (request: CommandRequest) => {
      setPending(true);
      try {
        const result = await getClient().command(request);
        if (!result.ok) toast?.show({ kind: "error", message: t("error", { code: result.code }) });
        return result.ok;
      } finally {
        setPending(false);
      }
    },
    [getClient, toast, t],
  );

  return { send, pending };
}

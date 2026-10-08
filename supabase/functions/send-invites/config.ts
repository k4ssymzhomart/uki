// send-invites' settings, from the function's environment (Supabase secrets on the cloud project;
// supabase/functions/local.env under `pnpm functions:serve`). Pure, so the functions-unit tests read it.
//
//   RESEND_API_KEY     required; without it nothing is sent and the call fails as internal
//   RESEND_BASE_URL    Resend's API, or a stub in tests and local runs
//   UKI_EMAIL_FROM     the sender; Resend's test sender until a domain is verified
//   UKI_EMAIL_SINK     when set, every invite goes to this one inbox instead (rehearsals, the demo)
//   UKI_WEB_URL        the dashboard's address; the email's images are its /email/*.png
//   UKI_DOWNLOAD_URL   where the button points: the installers
import { z } from "zod";
import { ApiFailure } from "../_shared/errors.ts";
import { RESEND_API } from "./resend.ts";

export const DEFAULT_FROM = "Üki <onboarding@resend.dev>";
/** The installers are attached to the repository's releases (desktop-dist.yml). */
export const DEFAULT_DOWNLOAD_URL = "https://github.com/k4ssymzhomart/uki/releases/latest";

export interface InviteConfig {
  apiKey: string;
  baseUrl: string;
  from: string;
  /** Every recipient becomes this address when it is set. */
  sink: string | null;
  /** `<dashboard>/email`, or null when UKI_WEB_URL is not set (the email goes without images). */
  assetsUrl: string | null;
  downloadUrl: string;
}

const HttpUrl = z.url({ protocol: /^https?$/ });
const Address = z.string().trim().toLowerCase().max(254).pipe(z.email());

function optional<T>(schema: z.ZodType<T>, name: string, value: string | undefined): T | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = schema.safeParse(value.trim());
  if (!parsed.success) throw new ApiFailure("internal", `${name} is not valid`);
  return parsed.data;
}

export function readInviteConfig(get: (name: string) => string | undefined): InviteConfig {
  const apiKey = get("RESEND_API_KEY")?.trim();
  if (!apiKey) throw new ApiFailure("internal", "RESEND_API_KEY is not set");
  const web = optional(HttpUrl, "UKI_WEB_URL", get("UKI_WEB_URL"));
  return {
    apiKey,
    baseUrl: optional(HttpUrl, "RESEND_BASE_URL", get("RESEND_BASE_URL")) ?? RESEND_API,
    from: get("UKI_EMAIL_FROM")?.trim() || DEFAULT_FROM,
    sink: optional(Address, "UKI_EMAIL_SINK", get("UKI_EMAIL_SINK")),
    assetsUrl: web === null ? null : `${web.replace(/\/+$/, "")}/email`,
    downloadUrl: optional(HttpUrl, "UKI_DOWNLOAD_URL", get("UKI_DOWNLOAD_URL")) ?? DEFAULT_DOWNLOAD_URL,
  };
}

/** Where one email goes: the sink when it is set, otherwise the recipient's own address. */
export function deliveryAddress(config: Pick<InviteConfig, "sink">, address: string): string {
  return config.sink ?? address;
}

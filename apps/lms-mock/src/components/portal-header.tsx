import { Avatar, icons } from "@uki/ui";
import { useT } from "../portal/i18n.tsx";
import { PORTAL_USER } from "../portal/quiz.ts";

/** The portal's top bar (Figma E.4 Portal header 97:9383). */
export function PortalHeader() {
  const t = useT();
  const Building = icons.building;
  return (
    <header className="flex h-14 w-full items-center gap-2.5 border-line-default border-b bg-surface pr-6 pl-7 text-fg-primary">
      <Building aria-hidden="true" className="size-4.5 shrink-0 text-icon-primary" />
      <span className="type-label-m whitespace-nowrap">{t("portal")}</span>
      <span className="min-w-0 flex-1" />
      <span className="type-ui-label whitespace-nowrap opacity-70">{PORTAL_USER.name}</span>
      <Avatar tone="paper" initials={PORTAL_USER.initials} />
    </header>
  );
}

import type { ReactNode } from "react";

export interface InfoRow {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

/** Label and value rows on a card (Figma E.4 Quiz info, E.9 Attempt summary). */
export function InfoCard({ rows }: { rows: readonly InfoRow[] }) {
  return (
    <dl className="flex w-140 max-w-full flex-col rounded-md border border-line-default bg-surface px-5 py-1.5 text-fg-primary">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-start gap-3 border-line-default border-b py-3 last:border-b-0"
        >
          <dt className="type-ui-label w-40 shrink-0 opacity-60">{row.label}</dt>
          <dd className="type-label-m whitespace-nowrap">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

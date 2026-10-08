import { Icon } from "@uki/ui";
import { type ReactNode, useId, useState } from "react";

export type FaqDisclosureProps = { question: ReactNode; answer: ReactNode };

/** A question that opens to a short answer in place (Figma Disclosure 79:2431; 1.4 closed, 1.4a open). */
export function FaqDisclosure({ question, answer }: FaqDisclosureProps) {
  const [open, setOpen] = useState(false);
  const answerId = useId();
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-2.5 rounded-md border border-line-default bg-surface px-5 py-4 text-fg-primary">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-3 overflow-clip rounded-sm text-left outline-none focus-visible:shadow-focus"
      >
        <Icon name="help" className="size-5" />
        <span className="min-w-0 flex-1 type-card-title">{question}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} className="size-5" />
      </button>
      <p id={answerId} hidden={!open} className="pl-8 opacity-70 type-body-s">
        {answer}
      </p>
    </div>
  );
}

import type { ReactNode } from "react";
import { Tab } from "../shell/tab.tsx";
import { TabGroup } from "../shell/tab-group.tsx";

export interface SegmentOption {
  value: string;
  label: ReactNode;
}

export interface SegmentChoiceProps {
  /** id of the overline, so the group is named by it. */
  labelId: string;
  /** Mono/Tag overline, for example "WHO" or "ADD". */
  label: ReactNode;
  options: readonly SegmentOption[];
  value: string;
  onValueChange: (value: string) => void;
}

/** An overline over a full-width row of segmented tabs (the WHO and ADD rows of Popover/Extend time). */
export function SegmentChoice({ labelId, label, options, value, onValueChange }: SegmentChoiceProps) {
  return (
    <div className="flex flex-col items-stretch gap-2">
      <span id={labelId} className="type-mono-tag opacity-50">
        {label}
      </span>
      <TabGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={onValueChange}
        variant="plain"
        className="flex w-full"
      >
        {options.map((option) => (
          <Tab key={option.value} value={option.value} className="min-w-0 flex-1">
            {option.label}
          </Tab>
        ))}
      </TabGroup>
    </div>
  );
}

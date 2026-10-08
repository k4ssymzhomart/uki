"use client";

import { cn } from "@uki/ui";
import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

/**
 * "On this page" of the legal pages (Figma 196:4146): the section in view gets the lime wash. Without
 * script the first item stays marked, as in the frame.
 */
export function LegalToc({ heading, items }: { heading: string; items: readonly TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const ids = items.map((item) => item.id);
    // The section whose heading has passed the top third of the window; the first one above that.
    const update = () => {
      const line = window.innerHeight / 3;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = id;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  return (
    <nav aria-label={heading} className="sticky top-6 flex w-65 shrink-0 flex-col gap-1 self-start">
      <p className="opacity-56 type-mono-tag">{heading}</p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={item.id === active ? "location" : undefined}
          onClick={() => setActive(item.id)}
          className={cn(
            "rounded-md px-3 py-2 outline-none transition-colors focus-visible:shadow-focus",
            item.id === active ? "bg-brand-subtle type-label-m" : "opacity-72 type-body-s hover:bg-hover",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

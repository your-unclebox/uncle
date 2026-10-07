"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

// ExpandableText (UI-UX §1.2): dipotong 6 baris di HP + "Baca selengkapnya".
export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 320 || text.split("\n").length > 6;
  return (
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          "max-w-[680px] whitespace-pre-line text-ink md:text-lg md:leading-7",
          long && !expanded && "line-clamp-6 md:line-clamp-none",
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          className="self-start text-sm font-medium text-primary md:hidden"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Tutup ▴" : "Baca selengkapnya ▾"}
        </button>
      ) : null}
    </div>
  );
}

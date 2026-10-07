"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// SectionTabNav (LP-03): sticky, tab aktif mengikuti scroll (scroll-spy).
export function SectionTabNav({
  sections,
}: {
  sections: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Bagian halaman"
      className="sticky top-14 z-20 border-b border-border bg-surface md:top-16"
    >
      <ul className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-2 md:px-4 lg:px-6">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
              className={cn(
                "block border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap",
                active === section.id
                  ? "border-primary text-primary"
                  : "border-transparent text-subtle hover:text-ink",
              )}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

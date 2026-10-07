import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Warna status tetap (UI-UX §2.3); status selalu warna + ikon + teks.
const TONES = {
  success: "bg-success-bg text-success border-success-border",
  danger: "bg-danger-bg text-danger border-danger-border",
  pending: "bg-pending-bg text-pending border-pending-border",
  info: "bg-info-bg text-info border-info-border",
  neutral: "bg-neutral-bg text-neutral border-neutral-border",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

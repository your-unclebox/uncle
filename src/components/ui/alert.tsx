import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { BadgeTone } from "./badge";

const TONES: Record<BadgeTone, string> = {
  success: "border-success-border bg-success-bg text-success",
  danger: "border-danger-border bg-danger-bg text-danger",
  pending: "border-pending-border bg-pending-bg text-pending",
  info: "border-info-border bg-info-bg text-info",
  neutral: "border-neutral-border bg-neutral-bg text-neutral",
};

export function Alert({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-lg border px-4 py-3 text-sm", TONES[tone])}
    >
      {children}
    </div>
  );
}

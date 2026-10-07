import { cn } from "@/lib/utils";

// Loading memakai skeleton, bukan spinner layar penuh (UI-UX §States).
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

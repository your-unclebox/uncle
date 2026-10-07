import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Input min 16px & tinggi 48px (UI-UX Responsive §1).
const base =
  "w-full rounded-lg border bg-surface px-4 text-base text-ink placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-primary disabled:bg-muted";

export function Input({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(base, "h-12", invalid ? "border-danger" : "border-border", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(base, "min-h-28 py-3", invalid ? "border-danger" : "border-border", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

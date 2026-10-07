import type { ReactNode } from "react";

// UI-UX States: Empty selalu memberi langkah selanjutnya.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div aria-hidden className="text-3xl text-placeholder">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-subtle">{description}</p>
      {action}
    </div>
  );
}

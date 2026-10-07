// UI-UX MetricCard: angka ringkasan + label.
export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums md:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

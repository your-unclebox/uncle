import { MetricCard } from "@/components/shared/metric-card";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { OwnerDashboardData } from "@/server/http/owner-pages";

export function SummaryCards({ summary }: { summary: OwnerDashboardData["summary"] }) {
  return (
    <section aria-label="Ringkasan" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard label="Total Event" value={formatNumber(summary.totalEvents)} />
      <MetricCard label="Tiket Terjual" value={formatNumber(summary.ticketsSold)} />
      <MetricCard label="Event Aktif" value={formatNumber(summary.activeEvents)} />
      <MetricCard label="Revenue" value={formatRupiah(summary.revenue)} hint="bruto, informasi" />
    </section>
  );
}

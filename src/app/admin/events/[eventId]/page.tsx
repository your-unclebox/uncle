import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminEvent, loadAdminOverview } from "@/server/http/admin-pages";
import { toJsonValue } from "@/server/http/json";
import { requireAdminPage } from "@/server/http/page-auth";

import type { AdminOrderList, AdminSummary } from "./_components/admin-types";
import { TransactionsView } from "./_components/transactions-view";

// Admin Dashboard: Ringkasan + Daftar Transaksi (ADM-03/04/05, UI-UX §3.1).
export default function AdminEventPage({ params }: PageProps<"/admin/events/[eventId]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content eventIdPromise={params.then((p) => p.eventId)} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

async function Content({ eventIdPromise }: { eventIdPromise: Promise<string> }) {
  const eventId = await eventIdPromise;
  const auth = await requireAdminPage(eventId);
  const [data, overview] = auth
    ? await Promise.all([
        loadAdminEvent(eventId, auth.user.id),
        loadAdminOverview(eventId, auth.user.id),
      ])
    : [null, null];
  if (!auth || !data || !overview) {
    return (
      <EmptyState
        icon="🔍"
        title="Event tidak ditemukan"
        description="Kamu tidak punya akses ke event ini."
      />
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">{data.eventName}</h1>
      {data.paymentConfig.status !== "CONNECTED" ? (
        <Alert tone="pending">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>⚠ QRIS belum aktif — pembeli hanya bisa bayar Cash.</span>
            <Button size="sm" asChild>
              <Link href={`/admin/events/${eventId}/payment-settings`}>Atur QRIS</Link>
            </Button>
          </div>
        </Alert>
      ) : null}
      <TransactionsView
        eventId={eventId}
        siteUrl={data.siteUrl}
        initialSummary={toJsonValue<AdminSummary>(overview.summary)}
        initialList={toJsonValue<AdminOrderList>(overview.orders)}
      />
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminEvent } from "@/server/http/admin-pages";
import { requireAdminPage } from "@/server/http/page-auth";

import { TransactionsDashboard } from "./_components/transactions-dashboard";

// Tujuan setelah login/aktivasi admin: banner QRIS + Ringkasan & Daftar
// Transaksi (ADM-03..06, UI-UX Wireframe §3.1/3.2).
export default function AdminEventPage({ params }: PageProps<"/admin/events/[eventId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-48" />}>
      <Content eventIdPromise={params.then((p) => p.eventId)} />
    </Suspense>
  );
}

async function Content({ eventIdPromise }: { eventIdPromise: Promise<string> }) {
  const eventId = await eventIdPromise;
  const auth = await requireAdminPage(eventId);
  const data = auth ? await loadAdminEvent(eventId, auth.user.id) : null;
  if (!auth || !data) {
    return (
      <EmptyState
        icon="🔍"
        title="Event tidak ditemukan"
        description="Kamu tidak punya akses ke event ini."
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">{data.eventName}</h1>
      {data.paymentConfig.status !== "CONNECTED" ? (
        <Alert tone="pending">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>⏳ QRIS belum aktif — pembeli hanya bisa Cash.</span>
            <Button size="sm" asChild>
              <Link href={`/admin/events/${eventId}/payment-settings`}>Atur QRIS</Link>
            </Button>
          </div>
        </Alert>
      ) : null}
      <TransactionsDashboard eventId={eventId} timezone={data.timezone} siteUrl={data.siteUrl} />
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminEvent } from "@/server/http/admin-pages";
import { requireAdminPage } from "@/server/http/page-auth";

// Tujuan setelah login/aktivasi admin. Ringkasan & Daftar Transaksi (ADM-03
// dst.) dibangun di fase Admin Dashboard; sementara banner status QRIS.
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
      <EmptyState
        icon="🛠"
        title={`Halo, ${auth.user.name}`}
        description="Ringkasan, daftar transaksi, dan scan tiket sedang dibangun."
      />
    </div>
  );
}

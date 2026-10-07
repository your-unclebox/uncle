import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminPage } from "@/server/http/page-auth";

// Tujuan setelah login/aktivasi admin. Admin Dashboard (ADM-03 dst.)
// dibangun di fase berikutnya.
export default function AdminEventPage({ params }: PageProps<"/admin/events/[eventId]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Content eventIdPromise={params.then((p) => p.eventId)} />
      </Suspense>
    </main>
  );
}

async function Content({ eventIdPromise }: { eventIdPromise: Promise<string> }) {
  const auth = await requireAdminPage(await eventIdPromise);
  if (!auth) {
    return (
      <EmptyState
        icon="🔍"
        title="Event tidak ditemukan"
        description="Kamu tidak punya akses ke event ini."
      />
    );
  }
  return (
    <EmptyState
      icon="🛠"
      title={`Halo, ${auth.user.name}`}
      description="Akun admin kamu sudah aktif. Admin Dashboard (transaksi & scan tiket) sedang dibangun."
    />
  );
}

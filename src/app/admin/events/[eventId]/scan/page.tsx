import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminEvent } from "@/server/http/admin-pages";
import { requireAdminPage } from "@/server/http/page-auth";

import { TicketScanner } from "./_components/ticket-scanner";

// SCN-01: Halaman Scan Tiket — hanya admin event yang login (mobile-first).
export default function ScanPage({ params }: PageProps<"/admin/events/[eventId]/scan">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
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
  return <TicketScanner eventId={eventId} eventName={data.eventName} timezone={data.timezone} />;
}

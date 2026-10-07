import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminEvent, loadAdminOverview } from "@/server/http/admin-pages";
import { toJsonValue } from "@/server/http/json";
import { requireAdminPage } from "@/server/http/page-auth";

import type { AdminSummary } from "../_components/admin-types";
import { Scanner } from "./_components/scanner";

// Scan Tiket (SCN-01): hanya admin event yang login; belum login → /login (AC-SCN-01.3).
export default function ScanPage({ params }: PageProps<"/admin/events/[eventId]/scan">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[70svh] max-w-md" />}>
      <Content eventIdPromise={params.then((p) => p.eventId)} />
    </Suspense>
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
  if (!data || !overview) {
    return (
      <EmptyState
        icon="🔍"
        title="Event tidak ditemukan"
        description="Kamu tidak punya akses ke event ini."
      />
    );
  }
  return (
    <Scanner
      eventId={eventId}
      eventName={data.eventName}
      summary={toJsonValue<AdminSummary>(overview.summary)}
    />
  );
}

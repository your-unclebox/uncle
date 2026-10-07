import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminEvent } from "@/server/http/admin-pages";
import { requireAdminPage } from "@/server/http/page-auth";

import { PaymentSettingsForm } from "../_components/payment-settings-form";

// Payment Settings (ADM-07, UI-UX §3.3): kredensial QRIS milik client.
export default function PaymentSettingsPage({
  params,
}: PageProps<"/admin/events/[eventId]/payment-settings">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-[560px]" />}>
      <Content eventIdPromise={params.then((p) => p.eventId)} />
    </Suspense>
  );
}

async function Content({ eventIdPromise }: { eventIdPromise: Promise<string> }) {
  const eventId = await eventIdPromise;
  const auth = await requireAdminPage(eventId);
  const data = auth ? await loadAdminEvent(eventId, auth.user.id) : null;
  if (!data) {
    return (
      <EmptyState
        icon="🔍"
        title="Event tidak ditemukan"
        description="Kamu tidak punya akses ke event ini."
      />
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Payment Settings</h1>
        <p className="text-subtle">{data.eventName}</p>
      </div>
      <PaymentSettingsForm eventId={eventId} initial={data.paymentConfig} />
    </div>
  );
}

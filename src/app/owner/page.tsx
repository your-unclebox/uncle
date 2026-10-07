import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadOwnerDashboard } from "@/server/http/owner-pages";
import { requireOwnerPage } from "@/server/http/page-auth";

import { AccessDenied } from "./_components/access-denied";
import { EventList } from "./_components/event-list";
import { SummaryCards } from "./_components/summary-cards";

// OWN-02 & OWN-03: Ringkasan Semua Event + Daftar Event.
export default function OwnerDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">Ringkasan Semua Event</h1>
        <Button asChild>
          <Link href="/owner/events/new">+ Buat Event</Link>
        </Button>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const access = await requireOwnerPage();
  if (access.kind === "forbidden") return <AccessDenied />;
  const data = await loadOwnerDashboard();
  return (
    <>
      <SummaryCards summary={data.summary} />
      <EventList events={data.events} />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </>
  );
}

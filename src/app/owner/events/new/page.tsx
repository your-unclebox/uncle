import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireOwnerPage } from "@/server/http/page-auth";

import { AccessDenied } from "../../_components/access-denied";
import { NewEventForm } from "./new-event-form";

// OWN-04: buat event Draft cukup dengan nama (AC-OWN-04.1).
export default function NewEventPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Buat Event</h1>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Guarded />
      </Suspense>
    </div>
  );
}

async function Guarded() {
  const access = await requireOwnerPage();
  return access.kind === "forbidden" ? <AccessDenied /> : <NewEventForm />;
}

import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadEventEditor } from "@/server/http/owner-pages";
import { requireOwnerPage } from "@/server/http/page-auth";

import { AccessDenied } from "../../_components/access-denied";
import { EventEditor } from "./_components/event-editor";

// OWN-04 s/d OWN-10: Edit Event (UI-UX Wireframe §2.3).
export default function EditEventPage({ params }: PageProps<"/owner/events/[eventId]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/owner" className="text-sm text-primary hover:underline">
        ← Daftar Event
      </Link>
      <Suspense fallback={<EditorSkeleton />}>
        <EditorContent eventIdPromise={params.then((p) => p.eventId)} />
      </Suspense>
    </div>
  );
}

async function EditorContent({ eventIdPromise }: { eventIdPromise: Promise<string> }) {
  const access = await requireOwnerPage();
  if (access.kind === "forbidden") return <AccessDenied />;
  const data = await loadEventEditor(await eventIdPromise, access.auth.user.id);
  if (!data) {
    return (
      <EmptyState
        icon="🔍"
        title="Event tidak ditemukan"
        description="Event mungkin sudah dihapus atau tautannya salah."
      />
    );
  }
  return <EventEditor data={data} />;
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-12" />
      <Skeleton className="h-96" />
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { AcceptInvitation } from "./accept-invitation";

export const metadata: Metadata = { title: "Aktivasi akun · Uncle" };

// ADM-01: aktivasi akun admin dari link undangan.
export default function InvitationPage({ params }: PageProps<"/undangan/[token]">) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-center text-sm font-semibold tracking-wide text-primary">UNCLE</p>
        <Suspense fallback={<Skeleton className="mt-6 h-80" />}>
          <AcceptInvitation tokenPromise={params.then((p) => p.token)} />
        </Suspense>
      </div>
    </main>
  );
}

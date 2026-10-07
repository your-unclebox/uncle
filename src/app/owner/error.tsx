"use client";

import { Button } from "@/components/ui/button";

// UI-UX States: Error menjelaskan apa yang terjadi + apa yang bisa dilakukan.
export default function OwnerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-danger-border bg-danger-bg p-6 text-danger">
      <p className="font-semibold">Gagal memuat halaman.</p>
      <Button variant="secondary" onClick={reset}>
        Coba Lagi
      </Button>
    </div>
  );
}

import Link from "next/link";
import { CheckOrderDialog } from "./check-order-dialog";

// EventHeader (UI-UX Components §1): header minimal + "Cek Pesanan", sticky.
// Logo client menyusul bersama upload media; sementara nama event sebagai teks.
export function EventHeader({ eventName }: { eventName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-none">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 md:h-16 md:px-6 lg:px-8">
        <Link href="/" className="truncate text-lg font-bold text-primary">
          {eventName}
        </Link>
        <CheckOrderDialog />
      </div>
    </header>
  );
}

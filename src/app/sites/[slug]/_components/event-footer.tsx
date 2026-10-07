import { Badge } from "@/components/ui/badge";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

// EventFooter (LP-14): kontak, syarat & kebijakan, metode bayar, "Powered by Uncle".
export function EventFooter({ event }: { event: PublicEvent }) {
  return (
    <footer className="border-t border-border bg-page pb-36 md:pb-0">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-sm md:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="flex flex-col gap-3">
          {event.contactInfo ? (
            <div>
              <p className="font-semibold">Kontak Penyelenggara</p>
              <p className="whitespace-pre-line text-subtle">{event.contactInfo}</p>
            </div>
          ) : null}
          {event.terms ? (
            <details>
              <summary className="cursor-pointer font-semibold">Syarat &amp; Kebijakan</summary>
              <p className="mt-2 max-w-[680px] whitespace-pre-line text-subtle">{event.terms}</p>
            </details>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <p className="flex items-center gap-2 text-subtle">
            Metode Bayar:
            {event.paymentMethods.qris ? <Badge tone="neutral">QRIS</Badge> : null}
            <Badge tone="neutral">Cash</Badge>
          </p>
          <p className="text-xs text-placeholder">Powered by Uncle</p>
        </div>
      </div>
    </footer>
  );
}

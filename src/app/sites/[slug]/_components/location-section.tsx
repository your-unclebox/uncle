import { Button } from "@/components/ui/button";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

import { CopyAddressButton } from "./copy-address-button";

// Section Lokasi (LP-13). Embed peta butuh Google Maps Embed API key (belum
// ada) → alamat teks + "Petunjuk Arah" (UI-UX States: peta tidak tersedia).
export function LocationSection({ event }: { event: PublicEvent }) {
  const address = [event.venueName, event.venueAddress].filter(Boolean).join(", ");
  if (!address) return null;
  const directions =
    event.mapsUrl ||
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return (
    <section id="lokasi" aria-labelledby="lokasi-title" className="scroll-mt-32 bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-10 md:px-6 lg:px-8 lg:py-16">
        <h2 id="lokasi-title" className="text-xl font-semibold md:text-2xl">
          Lokasi
        </h2>
        <address className="flex flex-col gap-1 not-italic">
          {event.venueName ? <span className="font-semibold">{event.venueName}</span> : null}
          {event.venueAddress ? <span className="text-ink">{event.venueAddress}</span> : null}
        </address>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <CopyAddressButton address={address} />
          <Button variant="secondary" size="sm" asChild>
            <a href={directions} target="_blank" rel="noopener noreferrer">
              Petunjuk Arah ↗
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

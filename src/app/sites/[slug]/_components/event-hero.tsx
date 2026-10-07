import { Button } from "@/components/ui/button";
import { formatEventDay, formatRupiah } from "@/lib/format";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

// EventHero (LP-02): banner, nama, tanggal & rentang jam, lokasi, CTA.
// Cover upload menyusul (media) → banner memakai warna client.
export function EventHero({
  event,
  startingPrice,
  ctaState,
}: {
  event: PublicEvent;
  startingPrice: number | null;
  ctaState: "available" | "soldOut" | "closed";
}) {
  const location = [event.venueName, event.venueAddress].filter(Boolean).join(", ");
  return (
    <section aria-label="Info event" className="bg-surface">
      <div className="mx-auto max-w-[1200px] md:px-6 md:pt-6 lg:px-8">
        <div
          aria-hidden
          className="aspect-[16/9] max-h-[480px] w-full bg-gradient-to-br from-primary to-[var(--color-secondary)] md:rounded-xl"
        />
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-6 md:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-[28px] leading-9 font-bold text-ink md:text-4xl md:leading-[44px]">
            {event.name}
          </h1>
          <p className="text-ink">
            📅 {formatEventDay(event.startsAt, event.timezone)}
            {event.timeRange ? <> · {event.timeRange}</> : null}
          </p>
          {location ? (
            <p className="text-ink">
              📍 {location}{" "}
              <a
                href="#lokasi"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Lihat peta
              </a>
            </p>
          ) : null}
        </div>
        <div className="hidden min-w-64 flex-col gap-3 rounded-xl border border-border p-5 shadow-sm md:flex">
          {startingPrice !== null ? (
            <p className="text-lg font-semibold tabular-nums">
              Mulai {formatRupiah(startingPrice)}
            </p>
          ) : null}
          {ctaState === "available" ? (
            <Button asChild>
              <a href="#tiket">Pilih Tiket</a>
            </Button>
          ) : (
            <Button disabled>{ctaState === "soldOut" ? "Tiket Habis" : "Penjualan ditutup"}</Button>
          )}
        </div>
      </div>
    </section>
  );
}

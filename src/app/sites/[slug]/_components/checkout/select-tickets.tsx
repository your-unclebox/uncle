"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicTicketType } from "@/server/modules/catalog/public-ticket-types";

import { useCheckout } from "./checkout-context";

// Step 1 — Pilih Tiket (LP-06, UI-UX §1.3).

function QuantityStepper({
  ticketType,
  value,
  max,
}: {
  ticketType: PublicTicketType;
  value: number;
  max: number;
}) {
  const { setQuantity } = useCheckout();
  const disabled = ticketType.remaining === 0;
  const buttonClass =
    "flex size-11 items-center justify-center rounded-lg border border-border text-xl font-semibold text-ink transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={buttonClass}
        aria-label={`Kurangi ${ticketType.name}`}
        disabled={disabled || value === 0}
        onClick={() => setQuantity(ticketType.id, value - 1)}
      >
        −
      </button>
      <output
        aria-live="polite"
        aria-label={`Jumlah ${ticketType.name}`}
        className="w-10 text-center text-lg font-semibold tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        className={buttonClass}
        aria-label={`Tambah ${ticketType.name}`}
        disabled={disabled || value >= max}
        onClick={() => setQuantity(ticketType.id, value + 1)}
      >
        +
      </button>
    </div>
  );
}

function TicketTypeCard({ ticketType }: { ticketType: PublicTicketType }) {
  const { quantities, maxFor } = useCheckout();
  const value = quantities[ticketType.id] ?? 0;
  const soldOut = ticketType.remaining === 0;
  const atQuota = !soldOut && value >= ticketType.remaining;
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm",
        soldOut && "opacity-60",
      )}
      data-testid="ticket-type-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">{ticketType.name}</h3>
        <p className="text-lg font-semibold tabular-nums">{formatRupiah(ticketType.price)}</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          {soldOut ? (
            <Badge tone="neutral">HABIS</Badge>
          ) : ticketType.lowStock ? (
            <p className="font-medium text-pending">⚠ Sisa {ticketType.remaining} tiket!</p>
          ) : (
            <p className="text-subtle">Kuota tersisa: {ticketType.remaining}</p>
          )}
          {atQuota ? (
            <p className="mt-1 text-subtle">
              Sisa kuota {ticketType.name}: {ticketType.remaining}
            </p>
          ) : null}
        </div>
        <QuantityStepper ticketType={ticketType} value={value} max={maxFor(ticketType)} />
      </div>
    </li>
  );
}

export function SelectTickets() {
  const { event, ticketTypes, totalQuantity, totalAmount, goTo } = useCheckout();
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {ticketTypes.map((ticketType) => (
          <TicketTypeCard key={ticketType.id} ticketType={ticketType} />
        ))}
      </ul>
      {totalQuantity >= event.maxTicketsPerOrder ? (
        <p className="text-sm text-subtle" role="status">
          Maksimal {event.maxTicketsPerOrder} tiket per transaksi.
        </p>
      ) : null}
      {/* Mobile: subtotal & CTA ada di sticky bottom bar. */}
      <div className="hidden flex-col gap-3 rounded-xl border border-border bg-surface p-4 md:flex">
        <div className="flex items-center justify-between">
          <span className="text-subtle">Subtotal ({totalQuantity} tiket)</span>
          <span className="text-lg font-semibold tabular-nums">{formatRupiah(totalAmount)}</span>
        </div>
        <Button disabled={totalQuantity === 0} onClick={() => goTo("customer")}>
          Lanjut Isi Data Diri →
        </Button>
      </div>
    </div>
  );
}

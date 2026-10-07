"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";

import { scrollToTickets, useCheckout } from "./checkout-context";
import { CheckoutSteps } from "./checkout-steps";
import { SelectTickets } from "./select-tickets";

// Section Tiket: Step 1 + alur checkout (UI-UX §1.3, States §1).

function ClosedNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      <p className="text-subtle">{children}</p>
    </div>
  );
}

export function TicketSection() {
  const { event, ticketTypes, soldOut, step } = useCheckout();

  if (event.salesState === "closed") {
    return (
      <ClosedNotice title="Penjualan ditutup">
        {event.finished
          ? "Event ini sudah selesai."
          : "Penjualan tiket untuk event ini sedang ditutup."}
      </ClosedNotice>
    );
  }
  if (ticketTypes.length === 0 || soldOut) {
    return (
      <ClosedNotice title="🎟 Tiket Habis">
        Semua tiket untuk event ini sudah terjual. Hubungi penyelenggara untuk info lebih lanjut.
      </ClosedNotice>
    );
  }
  return step === "select" ? <SelectTickets /> : <CheckoutSteps />;
}

/** Sidebar Ringkasan Pesanan (desktop, sticky) — muncul setelah ≥ 1 tiket dipilih. */
export function OrderSummarySidebar() {
  const { lines, totalAmount, totalQuantity, step, goTo } = useCheckout();
  if (totalQuantity === 0 || step === "done") return null;
  return (
    <div className="sticky top-32 flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-wide text-subtle uppercase">
        Ringkasan Pesanan
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {lines.map((line) => (
          <li key={line.ticketType.id} className="flex justify-between gap-3">
            <span>
              {line.quantity}× {line.ticketType.name}
            </span>
            <span className="tabular-nums">
              {formatRupiah(line.quantity * line.ticketType.price)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-border pt-3 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatRupiah(totalAmount)}</span>
      </div>
      {step === "select" ? (
        <Button onClick={() => goTo("customer")}>Lanjut Isi Data Diri</Button>
      ) : null}
    </div>
  );
}

/** Sticky bottom bar HP (UI-UX §1.2): harga mulai / jumlah + total + CTA. */
export function StickyCheckoutBar() {
  const { event, startingPrice, soldOut, totalQuantity, totalAmount, step, goTo } = useCheckout();
  if (step !== "select") return null;

  const closed = event.salesState === "closed";
  let summary: string | null = null;
  let action = (
    <Button className="w-full" onClick={scrollToTickets}>
      Pilih Tiket
    </Button>
  );
  if (closed || soldOut) {
    action = (
      <Button className="w-full" disabled>
        {closed ? "Penjualan ditutup" : "Tiket Habis"}
      </Button>
    );
  } else if (totalQuantity > 0) {
    summary = `${totalQuantity} tiket · ${formatRupiah(totalAmount)}`;
    action = (
      <Button className="w-full" onClick={() => goTo("customer")}>
        Lanjut Isi Data Diri →
      </Button>
    );
  } else if (startingPrice !== null) {
    summary = `Mulai ${formatRupiah(startingPrice)}`;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg md:hidden"
      data-testid="sticky-checkout-bar"
    >
      {summary ? <p className="font-semibold tabular-nums">{summary}</p> : null}
      {action}
    </div>
  );
}

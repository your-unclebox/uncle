"use client";

import Link from "next/link";
import { OrderCodeChip } from "@/components/shared/order-code-chip";
import { QRCodeDisplay } from "@/components/shared/qr-code-display";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEventDay, formatRupiah } from "@/lib/format";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

import { EmailDeliveryNote } from "./email-delivery-note";

// Step 5 "Tiket Siap" & halaman pesanan (LP-10, UI-UX §1.3, User Flow §2).

export interface TicketOrderView {
  readonly code: string;
  readonly status: string;
  readonly paymentMethod: string;
  readonly totalAmount: number;
  readonly items: ReadonlyArray<{ name: string; quantity: number }>;
  readonly qrPayload: string | null;
  readonly ticketStatus: string | null;
  readonly customer: { name: string; phoneMasked: string } | null;
  /** Status email QR Tiket di outbox (null = belum ada). */
  readonly emailStatus: string | null;
}

function itemsLabel(items: TicketOrderView["items"]): string {
  return items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
}

function EventLine({ event }: { event: PublicEvent }) {
  return (
    <p className="text-sm text-subtle">
      {event.name} · {formatEventDay(event.startsAt, event.timezone, "short")}
      {event.timeRange ? (
        <>
          <br />
          {event.timeRange}
        </>
      ) : null}
    </p>
  );
}

export function TicketReady({
  event,
  order,
  accessToken = null,
  justCreated = false,
}: {
  event: PublicEvent;
  order: TicketOrderView;
  /** Untuk memperbarui status email tanpa memuat ulang halaman. */
  accessToken?: string | null;
  justCreated?: boolean;
}) {
  const pickedUp = order.ticketStatus === "CHECKED_IN";

  if (order.status === "EXPIRED") {
    const cash = order.paymentMethod === "CASH";
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger">
          <p className="font-semibold">
            ⏱ {cash ? "Reservasi Kedaluwarsa" : "Pembayaran Kedaluwarsa"}
          </p>
          <p className="mt-1">
            {cash
              ? "Batas waktu reservasi sudah lewat dan tiket yang kamu pesan dilepas kembali."
              : "Waktu pembayaran sudah habis dan tiket yang kamu pilih dilepas kembali. Jika saldo sudah terpotong, hubungi penyelenggara dengan kode pesanan ini."}
          </p>
        </Alert>
        <OrderCodeChip code={order.code} />
        {event.salesState === "open" ? (
          <Button asChild>
            <Link href="/#tiket">Pesan Ulang</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger">
          ⛔ Pesanan dibatalkan. Hubungi penyelenggara untuk info lebih lanjut.
        </Alert>
        <OrderCodeChip code={order.code} />
      </div>
    );
  }

  if (order.status === "PENDING_PAYMENT") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="pending">⏳ Menunggu pembayaran QRIS.</Alert>
        <OrderCodeChip code={order.code} />
      </div>
    );
  }

  const paid = order.status === "PAID";
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {justCreated ? (
        <Alert tone="success">
          <span className="font-semibold">
            ✅ {paid ? "Pembayaran berhasil!" : "Pesanan berhasil dibuat!"}
          </span>
        </Alert>
      ) : null}

      {pickedUp ? (
        <Badge tone="success">✔ Tiket sudah diambil</Badge>
      ) : order.qrPayload ? (
        <QRCodeDisplay
          value={order.qrPayload}
          variant="ticket"
          downloadName={`tiket-${order.code}`}
          caption="Naikkan kecerahan layar saat ditunjukkan ke panitia."
        />
      ) : null}

      <div className="flex flex-col items-center gap-1">
        <span className="text-sm text-subtle">Kode pesanan</span>
        <OrderCodeChip code={order.code} />
      </div>

      {order.customer ? (
        <p className="text-sm text-ink">
          {order.customer.name} · {order.customer.phoneMasked}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="font-medium">{itemsLabel(order.items)}</span>
        {paid ? (
          <Badge tone="success">✔ Lunas</Badge>
        ) : (
          <Badge tone="pending">⏳ Belum bayar</Badge>
        )}
      </div>
      <EventLine event={event} />

      {!paid && !pickedUp ? (
        <div className="w-full rounded-lg border border-pending-border bg-pending-bg p-4 text-left text-sm text-ink">
          💵 Siapkan uang tunai <strong>{formatRupiah(order.totalAmount)}</strong> dan bayar ke
          panitia saat ambil tiket.
        </div>
      ) : null}

      {!pickedUp ? (
        <p className="text-sm text-ink">Tunjukkan QR ini saat pengambilan tiket di lokasi.</p>
      ) : null}
      <EmailDeliveryNote
        orderCode={order.code}
        accessToken={accessToken}
        initialStatus={order.emailStatus}
      />
      <p className="text-sm text-subtle">
        Simpan kode pesanan atau screenshot halaman ini sebagai cadangan.
      </p>
    </div>
  );
}

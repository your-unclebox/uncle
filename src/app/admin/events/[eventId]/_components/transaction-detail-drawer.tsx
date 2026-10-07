"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useState, type ReactNode } from "react";

import { OrderCodeChip } from "@/components/shared/order-code-chip";
import { TransactionStatusBadge } from "@/components/shared/transaction-status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatDateTime, formatRupiah } from "@/lib/format";

import type { OrderDetailJson, OrderHistoryJson } from "./transaction-types";

// ADM-06 — Drawer Detail Transaksi (UI-UX Wireframe §3.1): kanan 420px di
// desktop, layar penuh di HP; riwayat status siapa & kapan.

type Loaded = { id: string; data: OrderDetailJson } | { id: string; notFound: boolean };

const PAID_VIA: Record<NonNullable<OrderHistoryJson["paidVia"]>, string> = {
  GATEWAY_WEBHOOK: "Lunas (webhook)",
  GATEWAY_RECONCILE: "Lunas (cek status gateway)",
  CASH_MANUAL: "Lunas (Cash diterima)",
};

function historyLabel(entry: OrderHistoryJson): string {
  const by = entry.actorName ? ` oleh ${entry.actorName}` : "";
  switch (entry.kind) {
    case "CREATED":
      return entry.note ? `Pesanan dibuat dari reservasi ${entry.note}` : "Pesanan dibuat";
    case "PAID":
      return `${entry.paidVia ? PAID_VIA[entry.paidVia] : "Lunas"}${by}`;
    case "EXPIRED":
      return "Kedaluwarsa";
    case "CANCELLED":
      return `Dibatalkan${by}${entry.note ? ` — ${entry.note}` : ""}`;
    case "REFUNDED":
      return `Refund ditandai${by}${entry.note ? ` — ${entry.note}` : ""}`;
    case "CHECKED_IN":
      return `Diambil${by}`;
    case "REISSUED":
      return `Dibuatkan pesanan baru ${entry.note ?? ""}${by}`;
  }
}

// wa.me butuh format internasional tanpa "+" (081… → 6281…).
const whatsappUrl = (phone: string) =>
  `https://wa.me/${phone.startsWith("0") ? `62${phone.slice(1)}` : phone.replace(/\D/g, "")}`;

export function TransactionDetailDrawer({
  eventId,
  orderId,
  timezone,
  onClose,
}: {
  eventId: string;
  orderId: string | null;
  timezone: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    void (async () => {
      let next: Loaded;
      try {
        next = {
          id: orderId,
          data: await apiFetch<OrderDetailJson>(`/api/admin/events/${eventId}/orders/${orderId}`),
        };
      } catch (error) {
        next = { id: orderId, notFound: error instanceof ApiError && error.problem.status === 404 };
      }
      if (active) setLoaded(next);
    })();
    return () => {
      active = false;
    };
  }, [eventId, orderId, attempt]);

  const current = loaded && loaded.id === orderId ? loaded : null;

  return (
    <DialogPrimitive.Root open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface shadow-lg md:inset-y-0 md:right-0 md:left-auto md:w-[420px]">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
            <DialogPrimitive.Title className="text-lg font-semibold">
              Detail Transaksi
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded px-2 py-1 text-xl text-subtle hover:bg-muted"
              aria-label="Tutup"
            >
              ✕
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Rincian pembeli, tiket, pembayaran, dan riwayat status.
          </DialogPrimitive.Description>
          <div className="flex flex-col gap-5 px-6 py-5">
            {!current ? (
              <DetailSkeleton />
            ) : "data" in current ? (
              <DetailBody eventId={eventId} order={current.data} timezone={timezone} />
            ) : current.notFound ? (
              <Alert tone="danger">Transaksi tidak ditemukan.</Alert>
            ) : (
              <Alert tone="danger">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Gagal memuat detail transaksi.</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setLoaded(null);
                      setAttempt((n) => n + 1);
                    }}
                  >
                    Coba Lagi
                  </Button>
                </div>
              </Alert>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DetailBody({
  eventId,
  order,
  timezone,
}: {
  eventId: string;
  order: OrderDetailJson;
  timezone: string;
}) {
  const toast = useToast();
  const [resending, setResending] = useState(false);

  // ADM-08: kirim ulang email QR Tiket (hanya pesanan Lunas).
  async function resendTicket() {
    setResending(true);
    try {
      await apiFetch(`/api/admin/events/${eventId}/orders/${order.id}/resend-ticket`, {
        method: "POST",
      });
      toast("Email terkirim");
    } catch (error) {
      toast(
        error instanceof ApiError ? error.problem.title : "Email gagal dikirim. Coba lagi.",
        "danger",
      );
    } finally {
      setResending(false);
    }
  }

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(order.customer.phone);
      toast("No HP disalin");
    } catch {
      toast(order.customer.phone);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <OrderCodeChip code={order.code} />
        <div className="flex flex-wrap gap-2">
          <TransactionStatusBadge type="payment" status={order.status} />
          <TransactionStatusBadge type="pickup" status={order.pickup} />
        </div>
        {order.status === "RESERVED" && order.expiresAt ? (
          <p className="text-sm text-pending">
            Reservasi s/d {formatDateTime(order.expiresAt, timezone)} WIB
          </p>
        ) : null}
        {order.needsReview ? (
          <Alert tone="pending">⚠ Pembayaran perlu ditinjau (nominal/status tidak cocok).</Alert>
        ) : null}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
        <Row label="Nama">{order.customer.name}</Row>
        <Row label="No HP">
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{order.customer.phone}</span>
            <button type="button" onClick={copyPhone} className="text-primary hover:underline">
              Salin
            </button>
            <a
              href={whatsappUrl(order.customer.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              WA
            </a>
          </span>
        </Row>
        <Row label="Email">
          <span className="break-all">{order.customer.email}</span>
        </Row>
      </dl>
      {order.status === "PAID" ? (
        <Button variant="secondary" loading={resending} onClick={resendTicket}>
          {resending ? "Mengirim…" : "Kirim Ulang Email"}
        </Button>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
        {order.items.map((item) => (
          <div key={item.name} className="flex justify-between gap-4">
            <span>
              {item.quantity}× {item.name}
            </span>
            <span className="tabular-nums">{formatRupiah(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatRupiah(order.totalAmount)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-subtle">Metode</span>
          <span>{order.paymentMethod === "CASH" ? "Cash" : "QRIS"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="font-semibold">Riwayat</h3>
        <ul className="flex flex-col gap-2 text-sm" data-testid="order-history">
          {order.history.map((entry, index) => (
            <li key={`${entry.kind}-${index}`} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>
                <span className="text-subtle tabular-nums">
                  {formatDateTime(entry.at, timezone)}
                </span>{" "}
                {historyLabel(entry)}
              </span>
            </li>
          ))}
          {order.pickup === "PENDING" ? (
            <li className="flex gap-2 text-subtle">
              <span aria-hidden>•</span>
              <span>— Belum diambil</span>
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Memuat detail">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-32" />
    </div>
  );
}

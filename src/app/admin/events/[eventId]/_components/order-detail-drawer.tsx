"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

import { OrderCodeChip } from "@/components/shared/order-code-chip";
import { TransactionStatusBadge } from "@/components/shared/transaction-status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";

import { formatStamp, type AdminOrderDetail } from "./admin-types";

// TransactionDetailDrawer (ADM-06, UI-UX §3.1): drawer kanan 420px di desktop,
// layar penuh di HP. Data event lain → "Transaksi tidak ditemukan" tanpa data.

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; detail: AdminOrderDetail };

const EMAIL_LABEL: Record<string, string> = {
  PENDING: "Menunggu dikirim",
  SENDING: "Sedang dikirim",
  SENT: "✔ Terkirim",
  FAILED: "✘ Gagal dikirim",
  BOUNCED: "✘ Ditolak penerima (bounce)",
};

const waLink = (phone: string) => `https://wa.me/62${phone.replace(/^0/, "")}`;

export function OrderDetailDrawer({
  eventId,
  orderId,
  onClose,
  onChanged,
}: {
  eventId: string;
  orderId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const api = `/api/admin/events/${eventId}`;

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    setState({ kind: "loading" });
    apiFetch<AdminOrderDetail>(`${api}/orders/${orderId}`)
      .then((detail) => active && setState({ kind: "ready", detail }))
      .catch((error: unknown) => {
        if (!active) return;
        const notFound = error instanceof ApiError && error.problem.status === 404;
        setState({
          kind: "error",
          message: notFound ? "Transaksi tidak ditemukan" : "Gagal memuat detail, coba lagi.",
        });
      });
    return () => {
      active = false;
    };
  }, [api, orderId]);

  async function checkIn(detail: AdminOrderDetail) {
    if (!detail.ticket) return;
    setSaving(true);
    try {
      await apiFetch(`${api}/tickets/${detail.ticket.id}/check-in`, { method: "POST" });
      toast("Tiket ditandai diambil");
      setState({ kind: "ready", detail: await apiFetch(`${api}/orders/${detail.id}`) });
      onChanged();
    } catch (error) {
      toast(
        error instanceof ApiError ? error.problem.title : "Gagal menyimpan, coba lagi",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogPrimitive.Root open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface shadow-lg md:inset-y-0 md:right-0 md:left-auto md:w-[420px]"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
            <DialogPrimitive.Title className="text-lg font-semibold">
              Detail Transaksi
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Tutup">
                ✕
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex flex-col gap-5 px-5 py-5">
            {state.kind === "loading" ? (
              <>
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-28" />
                <Skeleton className="h-36" />
              </>
            ) : state.kind === "error" ? (
              <Alert tone="danger">{state.message}</Alert>
            ) : (
              <DetailBody
                detail={state.detail}
                saving={saving}
                onCheckIn={() => void checkIn(state.detail)}
                onCopy={(text) =>
                  void navigator.clipboard?.writeText(text).then(() => toast("No HP disalin"))
                }
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DetailBody({
  detail,
  saving,
  onCheckIn,
  onCopy,
}: {
  detail: AdminOrderDetail;
  saving: boolean;
  onCheckIn: () => void;
  onCopy: (text: string) => void;
}) {
  const canCheckIn = detail.status === "PAID" && detail.ticket?.status === "ISSUED";
  return (
    <>
      <div className="flex flex-col gap-2">
        <OrderCodeChip code={detail.code} />
        <div className="flex flex-wrap gap-2">
          <TransactionStatusBadge type="payment" status={detail.status} />
          <TransactionStatusBadge type="pickup" status={detail.ticket?.status ?? null} />
        </div>
        {detail.needsReview ? (
          <Alert tone="pending">
            ⚠ Perlu ditinjau (mis. pembayaran masuk setelah kedaluwarsa).
          </Alert>
        ) : null}
      </div>

      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 border-t border-border pt-4 text-sm">
        <dt className="text-subtle">Nama</dt>
        <dd className="font-medium">{detail.customer.name}</dd>
        <dt className="text-subtle">No HP</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{detail.customer.phone}</span>
          <Button variant="secondary" size="sm" onClick={() => onCopy(detail.customer.phone)}>
            📋 Salin
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href={waLink(detail.customer.phone)} target="_blank" rel="noreferrer">
              WA
            </a>
          </Button>
        </dd>
        <dt className="text-subtle">Email</dt>
        <dd className="break-all">{detail.customer.email}</dd>
        {detail.emailStatus ? (
          <>
            <dt className="text-subtle">Email QR</dt>
            <dd>{EMAIL_LABEL[detail.emailStatus] ?? detail.emailStatus}</dd>
          </>
        ) : null}
      </dl>

      <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
        {detail.items.map((item) => (
          <div key={item.name} className="flex justify-between gap-3">
            <span>
              {item.quantity}× {item.name}
            </span>
            <span className="tabular-nums">{formatRupiah(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatRupiah(detail.totalAmount)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-subtle">Metode</span>
          <span>{detail.paymentMethod === "CASH" ? "Cash" : "QRIS"}</span>
        </div>
        {detail.status === "RESERVED" && detail.expiresAt ? (
          <div className="flex justify-between gap-3">
            <span className="text-subtle">Reservasi s/d</span>
            <span>{formatStamp(detail.expiresAt)}</span>
          </div>
        ) : null}
        {detail.reissuedFrom ? (
          <p className="text-subtle">
            Dibuat dari reservasi kedaluwarsa {detail.reissuedFrom.code}.
          </p>
        ) : null}
        {detail.reissuedTo ? (
          <p className="text-subtle">Sudah dibuatkan pesanan baru {detail.reissuedTo.code}.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="font-semibold">Riwayat</h3>
        <ul className="flex flex-col gap-1 text-sm" data-testid="order-history">
          {detail.history.map((entry) => (
            <li key={`${entry.at}-${entry.label}`}>
              • <span className="tabular-nums text-subtle">{formatStamp(entry.at)}</span>{" "}
              {entry.label}
            </li>
          ))}
          {detail.ticket?.status === "ISSUED" ? <li>• — Belum diambil</li> : null}
        </ul>
      </div>

      {canCheckIn ? (
        <Button size="lg" loading={saving} onClick={onCheckIn}>
          {saving ? "Menyimpan…" : "Tandai Tiket Diambil"}
        </Button>
      ) : detail.status === "RESERVED" ? (
        <p className="text-sm text-subtle">
          Pembayaran Cash dikonfirmasi saat scan QR Tiket di lokasi (menu Scan Tiket).
        </p>
      ) : null}
    </>
  );
}

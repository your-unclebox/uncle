"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { OrderCodeChip } from "@/components/shared/order-code-chip";
import { QRCodeDisplay } from "@/components/shared/qr-code-display";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TicketOrderView } from "./ticket-ready";

// Step 4 — Pembayaran QRIS (LP-09, UI-UX §1.3 & States): QR pembayaran,
// countdown, polling status tiap ±3 detik, tombol "Cek Status".

const POLL_MS = 3_000;

interface CustomerOrderResponse {
  readonly order: {
    readonly code: string;
    readonly status: string;
    readonly paymentMethod: string;
    readonly totalAmount: number;
    readonly customer: { name: string; phoneMasked: string };
    readonly items: ReadonlyArray<{ name: string; quantity: number }>;
    readonly ticket: { status: string; qrPayload?: string | null } | null;
    readonly emailStatus: string | null;
  };
}

export function toTicketView(order: CustomerOrderResponse["order"]): TicketOrderView {
  return {
    code: order.code,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    items: order.items,
    qrPayload: order.ticket?.qrPayload ?? null,
    ticketStatus: order.ticket?.status ?? null,
    customer: order.customer,
    emailStatus: order.emailStatus,
  };
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function PaymentCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - now;
  return (
    <p
      className={cn(
        "text-lg font-semibold tabular-nums",
        remaining <= 30_000 ? "text-danger" : remaining <= 120_000 ? "text-pending" : "text-ink",
      )}
      data-testid="payment-countdown"
    >
      ⏱ Bayar dalam {formatCountdown(remaining)}
    </p>
  );
}

export function PaymentWaiting({
  orderCode,
  accessToken,
  qrString,
  expiresAt,
  totalAmount,
  onPaid,
  onRetry,
}: {
  orderCode: string;
  accessToken: string;
  qrString: string;
  expiresAt: string | null;
  totalAmount: number;
  onPaid: (order: TicketOrderView) => void;
  onRetry: () => void;
}) {
  const [expired, setExpired] = useState(false);
  const [paid, setPaid] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const done = useRef(false);
  const auth = { authorization: `Bearer ${accessToken}` };

  const handle = useCallback(
    async (response: CustomerOrderResponse) => {
      if (done.current) return;
      const { status } = response.order;
      if (status === "PAID") {
        done.current = true;
        setPaid(true);
        const ticket = await apiFetch<CustomerOrderResponse>(
          `/api/public/orders/${orderCode}/ticket`,
          { headers: { authorization: `Bearer ${accessToken}` } },
        );
        // "✅ Pembayaran berhasil!" → Step 5 dalam 1 detik (UI-UX States).
        setTimeout(() => onPaid(toTicketView(ticket.order)), 1_000);
      } else if (status === "EXPIRED" || status === "CANCELLED") {
        done.current = true;
        setExpired(true);
      }
    },
    [orderCode, accessToken, onPaid],
  );

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await apiFetch<CustomerOrderResponse>(`/api/public/orders/${orderCode}`, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        setOffline(false);
        if (active) await handle(response);
      } catch (error) {
        if (error instanceof ApiError && error.problem.code === "NETWORK_ERROR") setOffline(true);
      }
    };
    const timer = setInterval(() => {
      if (!done.current) void poll();
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderCode, accessToken, handle]);

  async function checkStatus() {
    setChecking(true);
    try {
      await handle(
        await apiFetch<CustomerOrderResponse>(`/api/public/orders/${orderCode}/payment/check`, {
          method: "POST",
          headers: auth,
        }),
      );
    } catch {
      // Gagal cek manual: polling otomatis tetap berjalan.
    } finally {
      setChecking(false);
    }
  }

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Alert tone="danger">
          <p className="font-semibold">⏱ Pembayaran Kedaluwarsa</p>
          <p className="mt-1">
            Waktu pembayaran sudah habis dan tiket yang kamu pilih dilepas kembali. Jika saldo sudah
            terpotong, hubungi penyelenggara dengan kode {orderCode}.
          </p>
        </Alert>
        <Button onClick={onRetry}>Pesan Ulang</Button>
      </div>
    );
  }

  if (paid) {
    return (
      <Alert tone="success">
        <span className="font-semibold">✅ Pembayaran berhasil!</span>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {offline ? (
        <Alert tone="pending">Koneksi terputus — status akan diperbarui saat online kembali.</Alert>
      ) : null}
      <h4 className="text-lg font-semibold">Scan untuk membayar</h4>
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm text-subtle">Kode pesanan</span>
        <OrderCodeChip code={orderCode} />
      </div>
      <QRCodeDisplay value={qrString} variant="payment" downloadName={`bayar-${orderCode}`} />
      <p className="text-lg">
        Total <strong className="tabular-nums">{formatRupiah(totalAmount)}</strong>
      </p>
      <PaymentCountdown expiresAt={expiresAt} />
      <p className="flex items-center gap-2 text-subtle" role="status">
        <span
          aria-hidden
          className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
        Menunggu pembayaran…
      </p>
      <ol className="w-full list-decimal pl-5 text-left text-sm text-ink">
        <li>Buka e-wallet / m-banking</li>
        <li>Pilih Scan/QRIS</li>
        <li>Scan QR di atas, cek nominal, lalu bayar</li>
      </ol>
      <p className="text-sm text-subtle">
        Sudah bayar tapi belum berubah? Status akan diperbarui otomatis.
      </p>
      <Button variant="secondary" size="sm" loading={checking} onClick={checkStatus}>
        Cek Status
      </Button>
    </div>
  );
}

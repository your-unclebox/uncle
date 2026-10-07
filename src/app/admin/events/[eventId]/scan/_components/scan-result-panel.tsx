"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { toLocalParts } from "@/lib/event-time";
import { cn } from "@/lib/utils";

import { itemsText, type ScanJson } from "./scan-types";

// Panel hasil scan (UI-UX Wireframe §4 (c)–(k), Microcopy §States 5). Warna
// latar = hasil, supaya terbaca sekilas di venue yang ramai/gelap.

type Tone = "success" | "pending" | "danger";

const PANEL: Record<Tone, string> = {
  success: "border-success-border bg-success-bg",
  pending: "border-pending-border bg-pending-bg",
  danger: "border-danger-border bg-danger-bg",
};
const HEADING: Record<Tone, string> = {
  success: "text-success",
  pending: "text-pending",
  danger: "text-danger",
};

export interface PanelActions {
  readonly busy: boolean;
  readonly onConfirmCash: (orderId: string) => void;
  readonly onCheckIn: (ticketId: string) => void;
  readonly onReissue: (orderId: string, expectedTotal: number) => void;
  readonly onOpenOrder: (orderCode: string) => void;
  readonly onNext: () => void;
}

export function ScanResultPanel({
  view,
  timezone,
  reissuedFromCode,
  actions,
}: {
  view: ScanJson;
  timezone: string;
  /** Diisi setelah "Buat Pesanan Baru" berhasil (UI-UX (k1) → PESANAN BARU — LUNAS). */
  reissuedFromCode: string | null;
  actions: PanelActions;
}) {
  const [cashReceived, setCashReceived] = useState(false);
  const time = (iso: string | null) => (iso ? toLocalParts(new Date(iso), timezone).time : "");
  const { order } = view;

  const next = (
    <Button variant="secondary" size="lg" className="w-full" onClick={actions.onNext}>
      Scan Berikutnya
    </Button>
  );

  switch (view.result) {
    case "INVALID":
      return (
        <Panel tone="danger" title="⛔ QR TIDAK DIKENALI">
          {view.reason === "PAYMENT_QR" ? (
            <p>Ini QR pembayaran, bukan QR tiket.</p>
          ) : (
            <p>Pastikan yang dipindai adalah QR Tiket dari email/halaman pesanan.</p>
          )}
          {next}
        </Panel>
      );
    case "OTHER_EVENT":
      return (
        <Panel tone="danger" title="⛔ QR TIDAK BERLAKU UNTUK EVENT INI">
          {next}
        </Panel>
      );
    case "CANCELLED":
      return (
        <Panel tone="danger" title="⛔ TRANSAKSI DIBATALKAN">
          {order ? <OrderLines order={order} /> : null}
          {next}
        </Panel>
      );
    case "ALREADY_CHECKED_IN":
      return (
        <Panel tone="danger" title="⛔ SUDAH DIAMBIL">
          <p className="font-medium">
            Diambil {formatDateTime(view.ticket?.checkedInAt ?? null, timezone)}
            {view.ticket?.checkedInBy ? ` oleh ${view.ticket.checkedInBy}` : ""}
          </p>
          {order ? <OrderLines order={order} /> : null}
          {next}
        </Panel>
      );
    case "READY_PICKUP": {
      const cashPaid = order?.paymentMethod === "CASH" && order.paidBy;
      const title = reissuedFromCode
        ? "✅ PESANAN BARU — LUNAS"
        : cashPaid
          ? "✅ LUNAS — siap diambil"
          : "✅ SIAP DIAMBIL";
      return (
        <Panel tone="success" title={title}>
          {order ? (
            <OrderLines
              order={order}
              payment={
                cashPaid ? `✔ Lunas (Cash, oleh ${order.paidBy} ${time(order.paidAt)})` : "✔ Lunas"
              }
            />
          ) : null}
          {reissuedFromCode ? (
            <p className="text-sm">Menggantikan {reissuedFromCode} (QR lama tidak berlaku).</p>
          ) : null}
          <Button
            size="lg"
            className="w-full"
            loading={actions.busy}
            onClick={() => view.ticket && actions.onCheckIn(view.ticket.id)}
          >
            Tandai Tiket Diambil
          </Button>
          <Button variant="ghost" className="w-full" onClick={actions.onNext}>
            Batal / Scan Lain
          </Button>
        </Panel>
      );
    }
    case "CASH_UNPAID":
      return (
        <Panel tone="pending" title="💵 BELUM BAYAR (CASH)">
          {order ? <OrderLines order={order} payment="⏳ Belum" /> : null}
          {order ? <Bill amount={order.totalAmount} /> : null}
          <CashCheckbox checked={cashReceived} onChange={setCashReceived} />
          <Button
            size="lg"
            className="w-full"
            disabled={!cashReceived}
            loading={actions.busy}
            onClick={() => order && actions.onConfirmCash(order.id)}
          >
            Konfirmasi Lunas
          </Button>
          <div>
            <Button variant="secondary" className="w-full" disabled>
              Tandai Diambil
            </Button>
            <p className="mt-1 text-center text-xs text-subtle">Aktif setelah lunas</p>
          </div>
          <Button variant="ghost" className="w-full" onClick={actions.onNext}>
            Batal / Scan Lain
          </Button>
        </Panel>
      );
    case "RESERVATION_EXPIRED": {
      const reissue = view.reissue;
      if (reissue?.reissuedOrder) {
        // (k3) Sudah dibuatkan pesanan baru.
        const created = reissue.reissuedOrder;
        return (
          <Panel tone="danger" title="⛔ RESERVASI KEDALUWARSA">
            <p className="font-medium">
              Sudah dibuatkan pesanan baru {created.code}
              {created.createdBy ? ` oleh ${created.createdBy}` : ""}, {time(created.createdAt)} (
              {created.ticketStatus === "CHECKED_IN" ? "✔ Diambil" : "○ Belum diambil"})
            </p>
            <Button className="w-full" onClick={() => actions.onOpenOrder(created.code)}>
              Buka Pesanan Baru
            </Button>
            {next}
          </Panel>
        );
      }
      if (!reissue?.available) {
        // (k2) Kuota habis — tanpa aksi.
        const short = (reissue?.items ?? []).filter((item) => item.remaining < item.quantity);
        return (
          <Panel tone="danger" title="⛔ RESERVASI KEDALUWARSA">
            <p>Kuota sudah dilepas otomatis</p>
            {order ? <OrderLines order={order} /> : null}
            <p className="rounded-lg border border-danger-border bg-surface p-4 text-lg font-medium">
              Maaf, kuota sudah habis karena reservasi tidak diambil tepat waktu.
            </p>
            {short.length > 0 ? (
              <p className="text-sm">{short.map((item) => `${item.name} habis`).join(", ")}</p>
            ) : null}
            {next}
          </Panel>
        );
      }
      // (k1) Kuota masih ada.
      return (
        <Panel tone="pending" title="⏱ RESERVASI KEDALUWARSA">
          <p>
            Kuota sudah dilepas otomatis
            <br />
            Batas: {formatDateTime(order?.expiresAt ?? null, timezone)}
          </p>
          {order ? <OrderLines order={order} /> : null}
          <p className="text-sm">
            Kuota sekarang: ✔ ada (
            {reissue.items.map((item) => `${item.name} sisa ${item.remaining}`).join(", ")})
          </p>
          <Bill amount={reissue.totalAmount} />
          <CashCheckbox checked={cashReceived} onChange={setCashReceived} />
          <Button
            size="lg"
            className="w-full"
            disabled={!cashReceived}
            loading={actions.busy}
            onClick={() => order && actions.onReissue(order.id, reissue.totalAmount)}
          >
            Buat Pesanan Baru dengan Data Ini
          </Button>
          <p className="text-sm text-subtle">
            Pesanan baru langsung Lunas. QR lama tidak berlaku; QR baru dikirim ke email pembeli.
          </p>
          <Button variant="ghost" className="w-full" onClick={actions.onNext}>
            Batal / Scan Lain
          </Button>
        </Panel>
      );
    }
  }
}

function Panel({ tone, title, children }: { tone: Tone; title: string; children: ReactNode }) {
  return (
    <section
      aria-live="assertive"
      data-testid="scan-result"
      className={cn("flex flex-col gap-4 rounded-xl border p-5", PANEL[tone])}
    >
      <h2 className={cn("text-xl font-bold", HEADING[tone])}>{title}</h2>
      {children}
    </section>
  );
}

function OrderLines({
  order,
  payment,
}: {
  order: NonNullable<ScanJson["order"]>;
  payment?: string;
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
      <dt className="text-subtle">Nama</dt>
      <dd className="font-semibold">{order.customerName}</dd>
      <dt className="text-subtle">Tiket</dt>
      <dd>{itemsText(order.items)}</dd>
      <dt className="text-subtle">Metode</dt>
      <dd>{order.paymentMethod === "CASH" ? "Cash" : "QRIS"}</dd>
      {payment ? (
        <>
          <dt className="text-subtle">Bayar</dt>
          <dd>{payment}</dd>
        </>
      ) : null}
      <dt className="text-subtle">Kode</dt>
      <dd className="font-mono" data-testid="scan-order-code">
        {order.code}
      </dd>
    </dl>
  );
}

function Bill({ amount }: { amount: number }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg border border-border bg-surface px-4 py-3">
      <span className="font-semibold text-subtle">TAGIH</span>
      <span className="text-2xl font-bold tabular-nums">{formatRupiah(amount)}</span>
    </div>
  );
}

function CashCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-base font-medium">
      <input
        type="checkbox"
        className="size-6 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Sudah terima uang
    </label>
  );
}

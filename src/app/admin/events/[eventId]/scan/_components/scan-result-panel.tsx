"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

import { formatClock, formatStamp, type ScanView } from "../../_components/admin-types";

// ScanResultPanel (UI-UX Halaman Scan §4 (c)–(k), Microcopy §5): warna penuh
// sesuai hasil + teks besar agar terbaca di venue.

type Tone = "success" | "pending" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  success: "border-success-border bg-success-bg",
  pending: "border-pending-border bg-pending-bg",
  danger: "border-danger-border bg-danger-bg",
};
const TITLE_CLASS: Record<Tone, string> = {
  success: "text-success",
  pending: "text-pending",
  danger: "text-danger",
};

export interface PanelActions {
  readonly busy: "confirm" | "checkIn" | "reissue" | null;
  readonly onConfirmCash: () => void;
  readonly onCheckIn: () => void;
  readonly onReissue: () => void;
  readonly onOpenOrder: (code: string) => void;
  readonly onNext: () => void;
}

const ticketsLabel = (view: ScanView) =>
  view.order?.items.map((item) => `${item.quantity}× ${item.name}`).join(", ") ?? "";

function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-base">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-subtle">{label}</dt>
          <dd className="font-medium">: {value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bill({ amount }: { amount: number }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg border border-pending-border bg-surface px-4 py-3">
      <span className="text-sm font-semibold text-subtle">TAGIH</span>
      <span data-testid="bill-amount" className="text-2xl font-bold tabular-nums">
        {formatRupiah(amount)}
      </span>
    </div>
  );
}

function CashReceived({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 text-base font-medium">
      <input
        type="checkbox"
        className="size-6"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Sudah terima uang
    </label>
  );
}

function paidLabel(view: ScanView) {
  const order = view.order;
  if (!order || order.status !== "PAID") return "⏳ Belum";
  if (order.paidVia !== "CASH_MANUAL") return "✔ Lunas";
  const by = order.cashConfirmedBy ? `, oleh ${order.cashConfirmedBy}` : "";
  return `✔ Lunas (Cash${by} ${formatClock(order.paidAt)})`;
}

export function ScanResultPanel({
  view,
  reissued,
  actions,
}: {
  view: ScanView;
  /** Panel pesanan baru hasil "Buat Pesanan Baru" (UI-UX (k1) → hijau). */
  reissued: boolean;
  actions: PanelActions;
}) {
  // Checkbox "Sudah terima uang" direset otomatis karena panel di-remount per hasil.
  const [cashReceived, setCashReceived] = useState(false);
  const order = view.order;
  const nextButton = (label = "Scan Berikutnya") => (
    <Button variant="secondary" size="lg" className="w-full" onClick={actions.onNext}>
      {label}
    </Button>
  );

  let tone: Tone = "danger";
  let title: string;
  let body: ReactNode = null;

  switch (view.result) {
    case "READY_PICKUP":
      tone = "success";
      title = reissued
        ? "✅ PESANAN BARU — LUNAS"
        : order?.paidVia === "CASH_MANUAL"
          ? "✅ LUNAS — siap diambil"
          : "✅ SIAP DIAMBIL";
      body = (
        <>
          <Rows
            rows={[
              ["Nama", order?.customerName],
              ["Tiket", ticketsLabel(view)],
              ["Metode", order?.paymentMethod === "CASH" ? "Cash" : "QRIS"],
              ["Bayar", paidLabel(view)],
              [
                "Kode",
                <span key="code" className="font-mono">
                  {order?.code}
                </span>,
              ],
            ]}
          />
          <Button
            size="lg"
            className="w-full"
            loading={actions.busy === "checkIn"}
            onClick={actions.onCheckIn}
          >
            {actions.busy === "checkIn" ? "Menyimpan…" : "Tandai Tiket Diambil"}
          </Button>
          {nextButton("Batal / Scan Lain")}
        </>
      );
      break;

    case "CASH_UNPAID":
      tone = "pending";
      title = "💵 BELUM BAYAR (CASH)";
      body = (
        <>
          <Rows
            rows={[
              ["Nama", order?.customerName],
              ["Tiket", ticketsLabel(view)],
              ["Metode", "Cash"],
              ["Bayar", "⏳ Belum"],
              [
                "Kode",
                <span key="code" className="font-mono">
                  {order?.code}
                </span>,
              ],
            ]}
          />
          <Bill amount={order?.totalAmount ?? 0} />
          <CashReceived checked={cashReceived} onChange={setCashReceived} />
          <Button
            size="lg"
            className="w-full"
            disabled={!cashReceived}
            loading={actions.busy === "confirm"}
            onClick={actions.onConfirmCash}
          >
            {actions.busy === "confirm" ? "Menyimpan…" : "Konfirmasi Lunas"}
          </Button>
          <Button variant="secondary" size="lg" className="w-full" disabled>
            Tandai Diambil
          </Button>
          <p className="-mt-2 text-center text-sm text-subtle">Aktif setelah lunas</p>
          {nextButton("Batal / Scan Lain")}
        </>
      );
      break;

    case "ALREADY_CHECKED_IN":
      title = "⛔ SUDAH DIAMBIL";
      body = (
        <>
          <p className="text-lg font-semibold">
            Diambil {formatStamp(view.ticket?.checkedInAt ?? null)}
            {view.ticket?.checkedInBy ? ` oleh ${view.ticket.checkedInBy}` : ""}
          </p>
          <Rows
            rows={[
              ["Nama", order?.customerName],
              ["Tiket", ticketsLabel(view)],
            ]}
          />
          {nextButton()}
        </>
      );
      break;

    case "RESERVATION_EXPIRED": {
      const reissue = view.reissue;
      const already = reissue?.reissuedOrder;
      const short = reissue?.items.filter((item) => item.remaining < item.quantity) ?? [];
      tone = view.actions.canReissue ? "pending" : "danger";
      title = view.actions.canReissue ? "⏱ RESERVASI KEDALUWARSA" : "⛔ RESERVASI KEDALUWARSA";
      const expiredRows: Array<[string, ReactNode]> = [
        ["Nama", order?.customerName],
        ["Tiket", ticketsLabel(view)],
      ];
      body = (
        <>
          <p className="font-medium">Kuota sudah dilepas otomatis</p>
          {order?.expiresAt ? (
            <p className="text-sm text-subtle">Batas: {formatStamp(order.expiresAt)}</p>
          ) : null}
          {already ? (
            <>
              <p className="text-lg font-semibold">
                Sudah dibuatkan pesanan baru {already.code}
                {already.createdBy ? ` oleh ${already.createdBy}` : ""},{" "}
                {formatClock(already.createdAt)} (
                {already.ticketStatus === "CHECKED_IN" ? "✔ Diambil" : "○ Belum diambil"})
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={() => actions.onOpenOrder(already.code)}
              >
                Buka Pesanan Baru
              </Button>
              {nextButton()}
            </>
          ) : view.actions.canReissue && reissue ? (
            <>
              <Rows rows={[...expiredRows, ["Kuota", "✔ ada"]]} />
              <Bill amount={reissue.totalAmount} />
              <CashReceived checked={cashReceived} onChange={setCashReceived} />
              <Button
                size="lg"
                className="h-auto min-h-14 w-full py-2"
                disabled={!cashReceived}
                loading={actions.busy === "reissue"}
                onClick={actions.onReissue}
              >
                {actions.busy === "reissue"
                  ? "Membuat pesanan…"
                  : "Buat Pesanan Baru dengan Data Ini"}
              </Button>
              <p className="text-sm text-subtle">
                Pesanan baru langsung Lunas. QR lama tidak berlaku; QR baru dikirim ke email
                pembeli.
              </p>
              {nextButton("Batal / Scan Lain")}
            </>
          ) : (
            <>
              <Rows rows={expiredRows} />
              <p className="rounded-lg border border-danger-border bg-surface px-4 py-3 text-lg font-semibold">
                {reissue && !reissue.available
                  ? "Maaf, kuota sudah habis karena reservasi tidak diambil tepat waktu."
                  : "Event sudah selesai — pesanan baru tidak bisa dibuat dari Scanner."}
              </p>
              {short.length > 0 && (reissue?.items.length ?? 0) > 1 ? (
                <p className="text-sm text-subtle">
                  {short.map((item) => `${item.name} habis`).join(", ")}
                </p>
              ) : null}
              {nextButton()}
            </>
          )}
        </>
      );
      break;
    }

    case "CANCELLED":
      title = "⛔ TRANSAKSI DIBATALKAN";
      body = (
        <>
          <Rows
            rows={[
              ["Nama", order?.customerName],
              [
                "Kode",
                <span key="code" className="font-mono">
                  {order?.code}
                </span>,
              ],
            ]}
          />
          {nextButton()}
        </>
      );
      break;

    case "QRIS_NOT_PAID":
      title =
        order?.status === "EXPIRED" ? "⛔ PEMBAYARAN QRIS KEDALUWARSA" : "⛔ QRIS BELUM LUNAS";
      body = (
        <>
          <Rows
            rows={[
              ["Nama", order?.customerName],
              ["Tiket", ticketsLabel(view)],
              [
                "Kode",
                <span key="code" className="font-mono">
                  {order?.code}
                </span>,
              ],
            ]}
          />
          <p className="text-sm text-subtle">
            Status QRIS hanya berubah otomatis setelah pembayaran diterima.
          </p>
          {nextButton()}
        </>
      );
      break;

    case "OTHER_EVENT":
      title = "⛔ QR TIDAK BERLAKU UNTUK EVENT INI";
      body = nextButton();
      break;

    case "INVALID":
      title =
        view.reason === "ORDER_CODE_NOT_FOUND" ? "⛔ KODE TIDAK DITEMUKAN" : "⛔ QR TIDAK DIKENALI";
      body = (
        <>
          {view.reason === "PAYMENT_QR" ? (
            <p className="text-lg font-semibold">Ini QR pembayaran, bukan QR tiket.</p>
          ) : view.reason === "ORDER_CODE_NOT_FOUND" ? (
            <p className="text-lg font-semibold">Kode tidak ditemukan untuk event ini.</p>
          ) : null}
          {nextButton()}
        </>
      );
      break;
  }

  return (
    <section
      data-testid="scan-result"
      data-result={view.result}
      aria-live="assertive"
      className={cn("flex flex-col gap-4 rounded-xl border-2 p-5", TONE_CLASS[tone])}
    >
      <h2 className={cn("text-2xl font-bold", TITLE_CLASS[tone])}>{title}</h2>
      {body}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { TransactionStatusBadge } from "@/components/shared/transaction-status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  itemsLabel,
  shortPhone,
  type AdminOrderList,
  type AdminOrderRow,
  type AdminSummary,
} from "./admin-types";
import { OrderDetailDrawer } from "./order-detail-drawer";

// Admin Dashboard — Ringkasan & Daftar Transaksi (ADM-03/04/05, UI-UX §3.1–3.2).

interface Filters {
  readonly status: string;
  readonly pickup: string;
  readonly method: string;
  readonly q: string;
  readonly includeUnfinished: boolean;
}

const EMPTY: Filters = { status: "", pickup: "", method: "", q: "", includeUnfinished: false };
const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  ["", "Semua"],
  ["PAID", "Lunas"],
  ["RESERVED", "Belum bayar"],
  ["PENDING_PAYMENT", "Menunggu"],
  ["EXPIRED", "Kedaluwarsa"],
  ["CANCELLED", "Dibatalkan"],
  ["REFUNDED", "Refund"],
] as const;
const PICKUP_OPTIONS = [
  ["", "Semua"],
  ["pending", "Belum diambil"],
  ["done", "Diambil"],
] as const;
const METHOD_OPTIONS = [
  ["", "Semua"],
  ["QRIS", "QRIS"],
  ["CASH", "Cash"],
] as const;

function queryString(filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.pickup) params.set("pickup", filters.pickup);
  if (filters.method) params.set("method", filters.method);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.includeUnfinished) params.set("includeUnfinished", "true");
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  return params.toString();
}

const isFiltered = (filters: Filters) =>
  Boolean(filters.status || filters.pickup || filters.method || filters.q.trim()) ||
  filters.includeUnfinished;

export function TransactionsView(props: {
  eventId: string;
  siteUrl: string | null;
  initialSummary: AdminSummary;
  initialList: AdminOrderList;
}) {
  return (
    <ToastProvider>
      <TransactionsContent {...props} />
    </ToastProvider>
  );
}

function TransactionsContent({
  eventId,
  siteUrl,
  initialSummary,
  initialList,
}: {
  eventId: string;
  siteUrl: string | null;
  initialSummary: AdminSummary;
  initialList: AdminOrderList;
}) {
  const api = `/api/admin/events/${eventId}`;
  const toast = useToast();
  const [summary, setSummary] = useState(initialSummary);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [list, setList] = useState(initialList);
  const [mobileRows, setMobileRows] = useState(initialList.orders);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const first = useRef(true);

  const load = useCallback(
    async (next: Filters, page: number, append = false) => {
      setLoading(true);
      setFailed(false);
      try {
        const [data, fresh] = await Promise.all([
          apiFetch<AdminOrderList>(`${api}/orders?${queryString(next, page)}`),
          apiFetch<AdminSummary>(`${api}/summary`),
        ]);
        setList(data);
        setMobileRows((rows) => (append ? [...rows, ...data.orders] : data.orders));
        setSummary(fresh);
        setUpdatedAt(new Date());
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  // Cari dengan debounce 300ms (UI-UX SearchInput); filter lain langsung.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => void load(filters, 1), filters.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters, load]);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  const cards: Array<{ label: string; value: number; patch: Partial<Filters> }> = [
    { label: "Terjual", value: summary.sold, patch: { status: "", pickup: "" } },
    { label: "Lunas", value: summary.paid, patch: { status: "PAID", pickup: "" } },
    { label: "Belum", value: summary.unpaid, patch: { status: "RESERVED", pickup: "" } },
    { label: "Diambil", value: summary.pickedUp, patch: { status: "", pickup: "done" } },
  ];

  return (
    <div className="flex flex-col gap-6">
      <OfflineBanner
        message={`Tidak ada koneksi internet${
          updatedAt
            ? ` — data terakhir diperbarui ${updatedAt.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""
        }`}
      />

      <section aria-labelledby="ringkasan" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="ringkasan" className="text-lg font-semibold">
            Ringkasan
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void load(filters, 1)}>
            ↻ Muat ulang
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((card) => (
            <button
              key={card.label}
              type="button"
              data-testid={`summary-${card.label.toLowerCase()}`}
              onClick={() => update(card.patch)}
              className="rounded-xl border border-border bg-surface p-4 text-left shadow-sm hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="text-sm text-subtle">{card.label}</span>
              <span className="mt-1 block text-2xl font-bold tabular-nums md:text-3xl">
                {formatNumber(card.value)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="daftar" className="flex flex-col gap-3">
        <h2 id="daftar" className="text-lg font-semibold">
          Daftar Transaksi
        </h2>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Input
              type="search"
              aria-label="Cari transaksi"
              placeholder="🔍 Cari nama / no HP / kode…"
              value={filters.q}
              onChange={(event) => update({ q: event.target.value })}
            />
          </div>
          {/* Desktop: dropdown sebaris. */}
          <div className="hidden flex-wrap gap-3 lg:flex">
            <FilterSelect
              label="Bayar"
              value={filters.status}
              options={STATUS_OPTIONS}
              onChange={(status) => update({ status })}
            />
            <FilterSelect
              label="Ambil"
              value={filters.pickup}
              options={PICKUP_OPTIONS}
              onChange={(pickup) => update({ pickup })}
            />
            <FilterSelect
              label="Metode"
              value={filters.method}
              options={METHOD_OPTIONS}
              onChange={(method) => update({ method })}
            />
          </div>
          {/* HP: chip cepat + bottom sheet filter lengkap. */}
          <div className="flex flex-wrap gap-2 lg:hidden">
            <Chip
              active={filters.status === "RESERVED"}
              onClick={() => update({ status: filters.status === "RESERVED" ? "" : "RESERVED" })}
            >
              Belum bayar
            </Chip>
            <Chip
              active={filters.pickup === "pending"}
              onClick={() => update({ pickup: filters.pickup === "pending" ? "" : "pending" })}
            >
              Belum ambil
            </Chip>
            <Chip active={false} onClick={() => setSheetOpen(true)}>
              Filter ▾
            </Chip>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-subtle">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={filters.includeUnfinished}
              onChange={(event) => update({ includeUnfinished: event.target.checked })}
            />
            Tampilkan pesanan belum selesai
          </label>
          <span data-testid="result-count" aria-live="polite">
            Menampilkan {formatNumber(list.total)} transaksi
          </span>
        </div>

        {failed ? (
          <EmptyState
            icon="⚠"
            title="Gagal memuat transaksi"
            description="Periksa koneksi lalu coba lagi."
            action={<Button onClick={() => void load(filters, list.page)}>Coba Lagi</Button>}
          />
        ) : loading && list.orders.length === 0 ? (
          <Skeleton className="h-64" />
        ) : list.total === 0 ? (
          isFiltered(filters) ? (
            <EmptyState
              icon="🔍"
              title="Tidak ada transaksi yang cocok"
              description="Ubah kata kunci atau filter."
              action={
                <Button variant="secondary" onClick={() => setFilters(EMPTY)}>
                  Reset filter
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="🎟"
              title="Belum ada transaksi"
              description="Bagikan link event untuk mulai menjual tiket."
              action={
                siteUrl ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void navigator.clipboard?.writeText(siteUrl).then(() => toast("Link disalin"))
                    }
                  >
                    Salin Link Event
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <OrdersTable rows={list.orders} onOpen={setSelected} />
            <ul className="flex flex-col gap-3 lg:hidden">
              {mobileRows.map((row) => (
                <li key={row.id}>
                  <OrderCard row={row} onOpen={setSelected} />
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden items-center justify-end gap-3 lg:flex">
              <Button
                variant="secondary"
                size="sm"
                disabled={list.page <= 1 || loading}
                onClick={() => void load(filters, list.page - 1)}
              >
                ‹ Sebelumnya
              </Button>
              <span className="text-sm text-subtle">
                Halaman {list.page} dari {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={list.page >= pageCount || loading}
                onClick={() => void load(filters, list.page + 1)}
              >
                Berikutnya ›
              </Button>
            </div>
            {list.page < pageCount ? (
              <Button
                variant="secondary"
                className="mt-4 w-full lg:hidden"
                disabled={loading}
                onClick={() => void load(filters, list.page + 1, true)}
              >
                {loading ? "Memuat…" : "Muat lebih banyak"}
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent title="Filter transaksi">
          <div className="flex flex-col gap-4">
            <FilterSelect
              label="Status bayar"
              value={filters.status}
              options={STATUS_OPTIONS}
              onChange={(status) => update({ status })}
            />
            <FilterSelect
              label="Status ambil"
              value={filters.pickup}
              options={PICKUP_OPTIONS}
              onChange={(pickup) => update({ pickup })}
            />
            <FilterSelect
              label="Metode bayar"
              value={filters.method}
              options={METHOD_OPTIONS}
              onChange={(method) => update({ method })}
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setFilters(EMPTY)}>
                Reset
              </Button>
              <Button className="flex-1" onClick={() => setSheetOpen(false)}>
                Terapkan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OrderDetailDrawer
        eventId={eventId}
        orderId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => void load(filters, list.page)}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm font-medium">
      {label}:
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-border bg-surface px-3 text-base"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-sm font-medium",
        active ? "border-primary bg-primary-subtle text-primary" : "border-border bg-surface",
      )}
    >
      {children}
    </button>
  );
}

function OrdersTable({ rows, onOpen }: { rows: AdminOrderRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted text-subtle">
          <tr>
            {["Nama", "No HP", "Tiket", "Metode", "Bayar", "Ambil"].map((head) => (
              <th key={head} scope="col" className="px-4 py-3 font-medium">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="order-row"
              tabIndex={0}
              onClick={() => onOpen(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(row.id);
              }}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
            >
              <td className="px-4 py-3 font-medium">
                {row.customerName}
                {row.needsReview ? <span title="Perlu ditinjau"> ⚠</span> : null}
              </td>
              <td className="px-4 py-3 tabular-nums">{shortPhone(row.customerPhone)}</td>
              <td className="px-4 py-3">{itemsLabel(row.items) || "—"}</td>
              <td className="px-4 py-3">{row.paymentMethod === "CASH" ? "Cash" : "QRIS"}</td>
              <td className="px-4 py-3">
                <TransactionStatusBadge type="payment" status={row.status} />
              </td>
              <td className="px-4 py-3">
                <TransactionStatusBadge type="pickup" status={row.ticketStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderCard({ row, onOpen }: { row: AdminOrderRow; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      data-testid="order-card"
      onClick={() => onOpen(row.id)}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-sm"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{row.customerName}</span>
        <span className="text-sm text-subtle">
          {row.paymentMethod === "CASH" ? "Cash" : "QRIS"}
        </span>
      </span>
      <span className="text-sm text-subtle">
        {shortPhone(row.customerPhone)} · {itemsLabel(row.items) || "—"}
      </span>
      <span className="flex flex-wrap gap-2">
        <TransactionStatusBadge type="payment" status={row.status} />
        <TransactionStatusBadge type="pickup" status={row.ticketStatus} />
      </span>
    </button>
  );
}

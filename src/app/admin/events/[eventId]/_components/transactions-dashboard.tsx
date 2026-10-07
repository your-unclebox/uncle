"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { TransactionStatusBadge } from "@/components/shared/transaction-status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TransactionDetailDrawer } from "./transaction-detail-drawer";
import {
  EMPTY_FILTERS,
  itemsLabel,
  type OrderListJson,
  type OrderRowJson,
  type SummaryJson,
  type TransactionFilters,
} from "./transaction-types";

// ADM-03..06 (UI-UX Wireframe §3.1/3.2, States §3): Ringkasan + Daftar Transaksi.
// Desktop: tabel; HP: kartu + chip filter cepat. Paginasi cursor "Muat lebih banyak".

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 25;

const PAYMENT_OPTIONS = [
  { value: "", label: "Semua" },
  { value: "PAID", label: "Lunas" },
  { value: "RESERVED", label: "Belum bayar" },
  { value: "PENDING_PAYMENT", label: "Menunggu pembayaran" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "CANCELLED", label: "Dibatalkan" },
  { value: "REFUNDED", label: "Refund" },
];
const PICKUP_OPTIONS = [
  { value: "", label: "Semua" },
  { value: "pending", label: "Belum diambil" },
  { value: "done", label: "Diambil" },
];
const METHOD_OPTIONS = [
  { value: "", label: "Semua" },
  { value: "QRIS", label: "QRIS" },
  { value: "CASH", label: "Cash" },
];

function queryString(filters: TransactionFilters, cursor?: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.status) params.set("status", filters.status);
  if (filters.pickup) params.set("pickup", filters.pickup);
  if (filters.method) params.set("method", filters.method);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.includeUnfinished) params.set("includeUnfinished", "true");
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

const hasFilter = (filters: TransactionFilters) =>
  Boolean(filters.status || filters.pickup || filters.method || filters.q.trim());

type Loaded<T> = { key: string; data: T } | { key: string; error: string };

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.problem.title : "Terjadi kesalahan. Coba lagi.";

export function TransactionsDashboard({
  eventId,
  timezone,
  siteUrl,
}: {
  eventId: string;
  timezone: string;
  siteUrl: string | null;
}) {
  const toast = useToast();
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState<Loaded<SummaryJson> | null>(null);
  const [list, setList] = useState<Loaded<OrderListJson> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const base = `/api/admin/events/${eventId}`;
  const listKey = `${reloadKey}|${queryString(filters)}`;
  const summaryKey = String(reloadKey);

  // Cari dengan debounce 300ms (UI-UX Components §2 SearchInput).
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((current) =>
          current.q === searchInput ? current : { ...current, q: searchInput },
        ),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let next: Loaded<SummaryJson>;
      try {
        next = { key: summaryKey, data: await apiFetch<SummaryJson>(`${base}/summary`) };
      } catch (error) {
        next = { key: summaryKey, error: errorMessage(error) };
      }
      if (active) setSummary(next);
    })();
    return () => {
      active = false;
    };
  }, [base, summaryKey]);

  useEffect(() => {
    let active = true;
    const query = listKey.slice(listKey.indexOf("|") + 1);
    void (async () => {
      let next: Loaded<OrderListJson>;
      try {
        next = { key: listKey, data: await apiFetch<OrderListJson>(`${base}/orders?${query}`) };
      } catch (error) {
        next = { key: listKey, error: errorMessage(error) };
      }
      if (active) setList(next);
    })();
    return () => {
      active = false;
    };
  }, [base, listKey]);

  function update(patch: Partial<TransactionFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function resetFilters() {
    setSearchInput("");
    setFilters(EMPTY_FILTERS);
  }

  async function loadMore() {
    if (!list || !("data" in list) || !list.data.nextCursor) return;
    const current = list;
    setLoadingMore(true);
    try {
      const next = await apiFetch<OrderListJson>(
        `${base}/orders?${queryString(filters, current.data.nextCursor ?? undefined)}`,
      );
      setList({
        key: current.key,
        data: { ...next, data: [...current.data.data, ...next.data] },
      });
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  async function copySiteUrl() {
    if (!siteUrl) return;
    try {
      await navigator.clipboard.writeText(siteUrl);
      toast("Link event disalin");
    } catch {
      toast(siteUrl);
    }
  }

  const listLoading = !list || list.key !== listKey;
  const listData = list && "data" in list ? list.data : null;

  return (
    <div className="flex flex-col gap-6">
      <SummarySection
        summary={summary && summary.key === summaryKey ? summary : null}
        filters={filters}
        onFilter={(patch) => update({ status: "", pickup: "", ...patch })}
        onRetry={() => setReloadKey((key) => key + 1)}
      />

      <section aria-labelledby="daftar-transaksi" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="daftar-transaksi" className="text-xl font-semibold">
            Daftar Transaksi
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            ↻ Perbarui
          </Button>
        </div>

        <Input
          type="search"
          aria-label="Cari transaksi"
          placeholder="🔍 Cari nama / no HP / kode…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={100}
        />

        {/* Chip cepat (HP) — UI-UX Responsive §4. */}
        <div className="flex flex-wrap gap-2 md:hidden">
          <QuickChip
            active={filters.status === "RESERVED"}
            onClick={() => update({ status: filters.status === "RESERVED" ? "" : "RESERVED" })}
          >
            Belum bayar
          </QuickChip>
          <QuickChip
            active={filters.pickup === "pending"}
            onClick={() => update({ pickup: filters.pickup === "pending" ? "" : "pending" })}
          >
            Belum ambil
          </QuickChip>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Bayar"
            value={filters.status}
            options={PAYMENT_OPTIONS}
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={filters.includeUnfinished}
              onChange={(e) => update({ includeUnfinished: e.target.checked })}
            />
            Tampilkan pesanan belum selesai
          </label>
          {listData ? (
            <p className="text-sm text-subtle md:ml-auto" data-testid="transaction-total">
              Menampilkan {formatNumber(listData.total)} transaksi
            </p>
          ) : null}
        </div>

        {listLoading ? (
          <ListSkeleton />
        ) : list && "error" in list ? (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Gagal memuat transaksi: {list.error}</span>
              <Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
                Coba Lagi
              </Button>
            </div>
          </Alert>
        ) : listData && listData.total === 0 ? (
          hasFilter(filters) ? (
            <EmptyState
              icon="🔍"
              title="Tidak ada transaksi yang cocok"
              description="Ubah kata kunci atau filter."
              action={
                <Button variant="secondary" onClick={resetFilters}>
                  Reset filter
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="🎟"
              title="Belum ada transaksi"
              description="Belum ada transaksi. Bagikan link event untuk mulai menjual tiket."
              action={
                siteUrl ? (
                  <Button variant="secondary" onClick={copySiteUrl}>
                    Salin Link Event
                  </Button>
                ) : undefined
              }
            />
          )
        ) : listData ? (
          <>
            <TransactionTable rows={listData.data} onSelect={setSelectedId} />
            <TransactionCards rows={listData.data} onSelect={setSelectedId} />
            {listData.nextCursor ? (
              <Button
                variant="secondary"
                className="self-center"
                loading={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Memuat…" : "Muat lebih banyak"}
              </Button>
            ) : null}
          </>
        ) : null}
      </section>

      <TransactionDetailDrawer
        eventId={eventId}
        orderId={selectedId}
        timezone={timezone}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function SummarySection({
  summary,
  filters,
  onFilter,
  onRetry,
}: {
  summary: Loaded<SummaryJson> | null;
  filters: TransactionFilters;
  onFilter: (patch: Partial<TransactionFilters>) => void;
  onRetry: () => void;
}) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Memuat ringkasan">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  if ("error" in summary) {
    return (
      <Alert tone="danger">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Gagal memuat ringkasan.</span>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Coba Lagi
          </Button>
        </div>
      </Alert>
    );
  }
  // Klik kartu = filter cepat (UI-UX §3.1).
  const cards = [
    { label: "Terjual", value: summary.data.sold, patch: {}, active: false },
    {
      label: "Lunas",
      value: summary.data.paid,
      patch: { status: "PAID" },
      active: filters.status === "PAID" && !filters.pickup,
    },
    {
      label: "Belum",
      value: summary.data.unpaid,
      patch: { status: "RESERVED" },
      active: filters.status === "RESERVED" && !filters.pickup,
    },
    {
      label: "Diambil",
      value: summary.data.pickedUp,
      patch: { pickup: "done" },
      active: filters.pickup === "done" && !filters.status,
    },
  ];
  return (
    <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={() => onFilter(card.patch)}
          aria-pressed={card.active}
          className={cn(
            "rounded-xl border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary",
            card.active ? "border-primary ring-1 ring-primary" : "border-border",
          )}
        >
          <span className="block text-sm text-subtle">{card.label}</span>
          <span
            className="mt-1 block text-2xl font-bold tabular-nums md:text-3xl"
            data-testid={`summary-${card.label.toLowerCase()}`}
          >
            {formatNumber(card.value)}
          </span>
        </button>
      ))}
    </section>
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
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={`Filter ${label.toLowerCase()}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 rounded-lg border border-border bg-surface px-3"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {label}: {option.label}
        </option>
      ))}
    </select>
  );
}

function QuickChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-4 text-sm font-medium",
        active ? "border-primary bg-primary-subtle text-primary" : "border-border bg-surface",
      )}
    >
      {children}
    </button>
  );
}

function TransactionTable({
  rows,
  onSelect,
}: {
  rows: readonly OrderRowJson[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Nama</th>
            <th className="px-4 py-3 font-medium">No HP</th>
            <th className="px-4 py-3 font-medium">Tiket</th>
            <th className="px-4 py-3 font-medium">Metode</th>
            <th className="px-4 py-3 font-medium">Bayar</th>
            <th className="px-4 py-3 font-medium">Ambil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t border-border hover:bg-page"
              onClick={() => onSelect(row.id)}
            >
              <td className="px-4 py-3">
                <button
                  type="button"
                  className="text-left font-medium text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(row.id);
                  }}
                >
                  {row.customerName}
                </button>
                <span className="block font-mono text-xs text-subtle">{row.code}</span>
              </td>
              <td className="px-4 py-3 tabular-nums">{row.customerPhoneMasked}</td>
              <td className="px-4 py-3">{itemsLabel(row.items)}</td>
              <td className="px-4 py-3">{row.paymentMethod === "CASH" ? "Cash" : "QRIS"}</td>
              <td className="px-4 py-3">
                <TransactionStatusBadge type="payment" status={row.status} />
              </td>
              <td className="px-4 py-3">
                <TransactionStatusBadge type="pickup" status={row.pickup} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionCards({
  rows,
  onSelect,
}: {
  rows: readonly OrderRowJson[];
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelect(row.id)}
            className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-sm"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{row.customerName}</span>
              <span className="text-sm text-subtle">
                {row.paymentMethod === "CASH" ? "Cash" : "QRIS"}
              </span>
            </span>
            <span className="text-sm text-subtle">
              {row.customerPhoneMasked} · {itemsLabel(row.items)}
            </span>
            <span className="flex flex-wrap gap-2">
              <TransactionStatusBadge type="payment" status={row.status} />
              <TransactionStatusBadge type="pickup" status={row.pickup} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Memuat transaksi">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

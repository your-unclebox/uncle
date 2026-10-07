"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { EventStatusBadge } from "@/components/shared/event-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEventDate } from "@/lib/format";
import type { OwnerDashboardData } from "@/server/http/owner-pages";

type EventRow = OwnerDashboardData["events"][number];

const STATUS_OPTIONS = [
  { value: "", label: "Semua" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "DRAFT", label: "Draft" },
  { value: "FINISHED", label: "Selesai" },
];

// UI-UX Wireframe §2.1/2.2: tabel di desktop, kartu di mobile; cari & filter status.
export function EventList({ events }: { events: EventRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          (!status || event.status === status) &&
          event.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [events, query, status],
  );

  if (events.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="Belum ada event"
        description="Belum ada event. Buat event pertama untuk client kamu."
        action={
          <Button asChild>
            <Link href="/owner/events/new">+ Buat Event</Link>
          </Button>
        }
      />
    );
  }

  return (
    <section aria-labelledby="daftar-event" className="flex flex-col gap-4">
      <h2 id="daftar-event" className="text-xl font-semibold">
        Daftar Event
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="Cari event"
          placeholder="Cari event…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-12 rounded-lg border border-border bg-surface px-3"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Status: {option.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Tidak ada event yang cocok"
          description="Ubah kata kunci atau filter status."
          action={
            <Button variant="secondary" onClick={() => (setQuery(""), setStatus(""))}>
              Reset filter
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-subtle">
                <tr>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Terjual</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Subdomain</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event) => (
                  <tr key={event.id} className="border-t border-border hover:bg-page">
                    <td className="px-4 py-3">
                      <Link
                        href={`/owner/events/${event.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {event.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <EventStatusBadge status={event.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {event.status === "DRAFT" ? "—" : `${event.sold} / ${event.totalQuota}`}
                    </td>
                    <td className="px-4 py-3">{formatEventDate(event.startsAt, event.timezone)}</td>
                    <td className="px-4 py-3 text-subtle">{event.slug ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/owner/events/${event.id}`}
                  className="block rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{event.name}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-sm text-subtle">
                    {formatEventDate(event.startsAt, event.timezone)} · {event.sold} terjual
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

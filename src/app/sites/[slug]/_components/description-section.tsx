import { formatEventDay } from "@/lib/format";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

import { ExpandableText } from "./expandable-text";

// Section Deskripsi (LP-04): info grid + deskripsi + Kebijakan Pengembalian.
export function DescriptionSection({ event }: { event: PublicEvent }) {
  const info = [
    { label: "Tanggal", value: formatEventDay(event.startsAt, event.timezone) },
    { label: "Jam", value: event.timeRange },
    { label: "Kategori", value: event.category },
    { label: "Tipe", value: event.eventType },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <section
      id="deskripsi"
      aria-labelledby="deskripsi-title"
      className="scroll-mt-32 py-10 lg:py-16"
    >
      <h2 id="deskripsi-title" className="mb-4 text-xl font-semibold md:text-2xl">
        Deskripsi
      </h2>
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr_auto_1fr]">
        {info.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-subtle">{item.label}</dt>
            <dd className="text-ink" data-testid={`info-${item.label.toLowerCase()}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {event.description ? <ExpandableText text={event.description} /> : null}
      {event.refundPolicy ? (
        <details className="mt-6 max-w-[680px] rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">Kebijakan Pengembalian</summary>
          <p className="mt-3 whitespace-pre-line text-ink">{event.refundPolicy}</p>
        </details>
      ) : null}
    </section>
  );
}

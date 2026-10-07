import { Badge, type BadgeTone } from "@/components/ui/badge";

// UI-UX Design System §2.3 (pemetaan status → badge) & §States 5 (microcopy);
// label DB → UI mengikuti DRD §Database 4.2.
const PAYMENT: Record<string, { tone: BadgeTone; label: string }> = {
  PAID: { tone: "success", label: "✔ Lunas" },
  RESERVED: { tone: "pending", label: "⏳ Belum bayar" },
  PENDING_PAYMENT: { tone: "pending", label: "⏳ Menunggu pembayaran" },
  EXPIRED: { tone: "neutral", label: "Kedaluwarsa" },
  CANCELLED: { tone: "danger", label: "Dibatalkan" },
  REFUNDED: { tone: "danger", label: "Refund (ditandai)" },
};

const PICKUP: Record<string, { tone: BadgeTone; label: string }> = {
  DONE: { tone: "success", label: "✔ Diambil" },
  PENDING: { tone: "neutral", label: "○ Belum diambil" },
};

export function TransactionStatusBadge({
  type,
  status,
}: {
  type: "payment" | "pickup";
  status: string | null;
}) {
  if (status === null) return <span className="text-subtle">—</span>;
  const entry = (type === "payment" ? PAYMENT : PICKUP)[status] ?? {
    tone: "neutral" as const,
    label: status,
  };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

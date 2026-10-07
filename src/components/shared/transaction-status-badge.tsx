import { Badge, type BadgeTone } from "@/components/ui/badge";

// Microcopy status (UI-UX States §5, DRD §Database 4.2): warna + ikon + teks.
const PAYMENT: Record<string, { tone: BadgeTone; label: string }> = {
  PAID: { tone: "success", label: "✔ Lunas" },
  RESERVED: { tone: "pending", label: "⏳ Belum bayar" },
  PENDING_PAYMENT: { tone: "info", label: "⏳ Menunggu pembayaran" },
  EXPIRED: { tone: "neutral", label: "Kedaluwarsa" },
  CANCELLED: { tone: "danger", label: "Dibatalkan" },
  REFUNDED: { tone: "neutral", label: "Refund (ditandai)" },
};

const PICKUP: Record<string, { tone: BadgeTone; label: string }> = {
  CHECKED_IN: { tone: "success", label: "✔ Diambil" },
  ISSUED: { tone: "neutral", label: "○ Belum diambil" },
};

export function TransactionStatusBadge({
  type,
  status,
}: {
  type: "payment" | "pickup";
  status: string | null;
}) {
  const entry = status ? (type === "payment" ? PAYMENT : PICKUP)[status] : undefined;
  if (!entry) return <span className="text-sm text-subtle">—</span>;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

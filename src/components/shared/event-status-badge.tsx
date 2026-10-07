import { Badge, type BadgeTone } from "@/components/ui/badge";

// UI-UX pemetaan status → badge: Aktif/Draft/Selesai = Sukses/Netral/Info.
const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  ACTIVE: { tone: "success", label: "● Aktif" },
  DRAFT: { tone: "neutral", label: "○ Draft" },
  FINISHED: { tone: "info", label: "◉ Selesai" },
  ARCHIVED: { tone: "neutral", label: "Diarsipkan" },
};

export function EventStatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

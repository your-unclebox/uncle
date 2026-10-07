// Format tampilan Indonesia (UI-UX §3: angka tabular, Rupiah utuh).
const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatRupiah(value: number | bigint | string): string {
  return `Rp ${rupiah.format(typeof value === "string" ? Number(value) : value)}`;
}

export function formatNumber(value: number): string {
  return rupiah.format(value);
}

export function formatEventDate(iso: string | Date | null, timeZone = "Asia/Jakarta"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// Hero & Step 5 (UI-UX §1): "Minggu, 20 Des 2026" / "Min, 20 Des 2026".
export function formatEventDay(
  iso: string | Date | null,
  timeZone = "Asia/Jakarta",
  weekday: "long" | "short" = "long",
): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    weekday,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// Riwayat transaksi (UI-UX §3.1 Drawer): "12 Nov 2026 10:02".
export function formatDateTime(iso: string | Date | null, timeZone = "Asia/Jakarta"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("id-ID", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} ${time}`;
}

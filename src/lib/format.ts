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

// T17 masih terbuka: MVP hanya WIB (Asia/Jakarta, UTC+7 tanpa DST).
const OFFSETS: Record<string, string> = { "Asia/Jakarta": "+07:00" };

export function toInstant(date: string, time: string, timeZone: string): Date {
  const offset = OFFSETS[timeZone];
  if (!offset) throw new Error(`Zona waktu ${timeZone} belum didukung.`);
  return new Date(`${date}T${time}:00${offset}`);
}

export function toLocalParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

// UI-UX: format rentang "HH:MM–HH:MM WIB".
export function formatTimeRange(startsAt: Date, endsAt: Date, timeZone: string): string {
  return `${toLocalParts(startsAt, timeZone).time}–${toLocalParts(endsAt, timeZone).time} WIB`;
}

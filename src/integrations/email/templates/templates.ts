import { escapeHtml } from "@/lib/html";

// Template email transaksional (DRD Integrations §2). Semua nilai dinamis
// di-escape; QR Tiket sebagai gambar inline (cid:) + tautan cadangan ke
// halaman pesanan bila gambar diblokir.

export const TICKET_QR_CID = "qr-ticket";

export interface EmailContent {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EventSummary {
  readonly name: string;
  readonly dateLabel: string;
  readonly timeRange: string | null;
  readonly venue: string | null;
  readonly mapsUrl: string | null;
  readonly primaryColor: string | null;
  readonly contact: string | null;
}

export interface OrderSummary {
  readonly code: string;
  readonly items: ReadonlyArray<{ name: string; quantity: number; unitPrice: number }>;
  readonly totalAmount: number;
}

const rupiah = (value: number) =>
  `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value)}`;

const DEFAULT_PRIMARY = "#2563EB";

// Hanya tautan http(s) yang dirender (mencegah javascript: dari input Owner).
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
const safeColor = (color: string | null) =>
  color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_PRIMARY;

function layout(event: EventSummary, body: string): string {
  const primary = safeColor(event.primaryColor);
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="background:${escapeHtml(primary)};height:6px;border-radius:12px 12px 0 0"></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:14px;color:#475569">${escapeHtml(event.name)}</p>
${body}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
${event.contact ? `Kontak penyelenggara: ${escapeHtml(event.contact)}<br>` : ""}Email ini dikirim otomatis. Powered by Uncle.
</td></tr></table></td></tr></table></body></html>`;
}

function eventLines(event: EventSummary): { html: string; text: string } {
  const when = [event.dateLabel, event.timeRange].filter(Boolean).join(" · ");
  const mapsUrl = safeUrl(event.mapsUrl);
  const html = `<p style="margin:16px 0 0;font-size:14px;line-height:22px">
📅 ${escapeHtml(when)}${
    event.venue
      ? `<br>📍 ${escapeHtml(event.venue)}${
          mapsUrl ? ` — <a href="${escapeHtml(mapsUrl)}" style="color:#2563eb">Lihat peta</a>` : ""
        }`
      : ""
  }</p>`;
  const text = [`Waktu: ${when}`, event.venue ? `Lokasi: ${event.venue}` : null]
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

function itemLines(order: OrderSummary): { html: string; text: string } {
  const rows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0">${item.quantity}× ${escapeHtml(item.name)}</td><td align="right" style="padding:4px 0">${rupiah(item.quantity * item.unitPrice)}</td></tr>`,
    )
    .join("");
  const html = `<table role="presentation" width="100%" style="margin-top:16px;font-size:14px;border-top:1px solid #e2e8f0">${rows}<tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #e2e8f0">Total</td><td align="right" style="padding:8px 0;font-weight:bold;border-top:1px solid #e2e8f0">${rupiah(order.totalAmount)}</td></tr></table>`;
  const text = [
    ...order.items.map(
      (item) => `${item.quantity}x ${item.name} — ${rupiah(item.quantity * item.unitPrice)}`,
    ),
    `Total: ${rupiah(order.totalAmount)}`,
  ].join("\n");
  return { html, text };
}

function qrBlock(order: OrderSummary, orderUrl: string): string {
  return `<div style="text-align:center;margin:20px 0">
<p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1px;color:#475569">QR TIKET</p>
<img src="cid:${TICKET_QR_CID}" width="240" height="240" alt="QR Tiket ${escapeHtml(order.code)}" style="display:inline-block;border:1px solid #e2e8f0;border-radius:12px">
<p style="margin:8px 0 0;font-family:'Courier New',monospace;font-size:20px;font-weight:bold">${escapeHtml(order.code)}</p>
<p style="margin:8px 0 0;font-size:13px"><a href="${escapeHtml(orderUrl)}" style="color:#2563eb">Gambar tidak tampil? Buka QR Tiket di sini</a></p>
</div>`;
}

/** TICKET_ISSUED — QRIS lunas (AC-LP-10.2). */
export function ticketIssuedEmail(input: {
  event: EventSummary;
  order: OrderSummary;
  orderUrl: string;
}): EmailContent {
  const lines = eventLines(input.event);
  const items = itemLines(input.order);
  const html = layout(
    input.event,
    `<h1 style="margin:0;font-size:22px">✅ Pembayaran berhasil — tiket kamu siap</h1>
${qrBlock(input.order, input.orderUrl)}
<p style="margin:0;font-size:14px">Status bayar: <strong style="color:#15803d">✔ Lunas</strong></p>
${items.html}${lines.html}
<p style="margin:16px 0 0;font-size:14px">Tunjukkan QR ini saat pengambilan tiket di lokasi.</p>`,
  );
  const text = [
    `Pembayaran berhasil — tiket ${input.event.name}`,
    `Kode pesanan: ${input.order.code} (Lunas)`,
    items.text,
    lines.text,
    `QR Tiket: ${input.orderUrl}`,
    "Tunjukkan QR ini saat pengambilan tiket di lokasi.",
  ].join("\n\n");
  return {
    subject: `Tiket ${input.event.name} — ${input.order.code}`,
    html,
    text,
  };
}

/** CASH_RESERVATION — QR Tiket + nominal + batas reservasi (DRD §4.1). */
export function cashReservationEmail(input: {
  event: EventSummary;
  order: OrderSummary;
  orderUrl: string;
  reservationDeadline: string | null;
}): EmailContent {
  const lines = eventLines(input.event);
  const items = itemLines(input.order);
  const deadline = input.reservationDeadline
    ? ` Reservasi berlaku sampai <strong>${escapeHtml(input.reservationDeadline)}</strong>.`
    : "";
  const html = layout(
    input.event,
    `<h1 style="margin:0;font-size:22px">Pesanan berhasil dibuat</h1>
${qrBlock(input.order, input.orderUrl)}
<p style="margin:0;font-size:14px">Status bayar: <strong style="color:#b45309">⏳ Belum bayar (Cash)</strong></p>
<p style="margin:12px 0 0;padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:14px">
💵 Siapkan uang tunai <strong>${rupiah(input.order.totalAmount)}</strong> dan bayar ke panitia saat ambil tiket.${deadline}</p>
${items.html}${lines.html}`,
  );
  const text = [
    `Pesanan ${input.event.name} berhasil dibuat`,
    `Kode pesanan: ${input.order.code} (Belum bayar — Cash)`,
    `Siapkan uang tunai ${rupiah(input.order.totalAmount)} dan bayar ke panitia saat ambil tiket.${
      input.reservationDeadline ? ` Reservasi berlaku sampai ${input.reservationDeadline}.` : ""
    }`,
    items.text,
    lines.text,
    `QR Tiket: ${input.orderUrl}`,
  ].join("\n\n");
  return {
    subject: `Reservasi tiket ${input.event.name} — ${input.order.code}`,
    html,
    text,
  };
}

/** RESERVATION_EXPIRED — reservasi Cash lewat batas, kuota dilepas (BR-TRX-08). */
export function reservationExpiredEmail(input: {
  event: EventSummary;
  orderCode: string;
  siteUrl: string;
}): EmailContent {
  const html = layout(
    input.event,
    `<h1 style="margin:0;font-size:22px">Reservasi kedaluwarsa</h1>
<p style="margin:12px 0 0;font-size:14px;line-height:22px">Reservasi <strong style="font-family:'Courier New',monospace">${escapeHtml(input.orderCode)}</strong> sudah lewat batas waktu dan tiketnya dilepas kembali. QR Tiket untuk pesanan ini tidak berlaku lagi.</p>
<p style="margin:12px 0 0;font-size:14px"><a href="${escapeHtml(input.siteUrl)}" style="color:#2563eb">Pesan ulang di halaman event</a></p>`,
  );
  return {
    subject: `Reservasi ${input.orderCode} kedaluwarsa — ${input.event.name}`,
    html,
    text: [
      `Reservasi ${input.orderCode} untuk ${input.event.name} sudah lewat batas waktu dan tiketnya dilepas kembali.`,
      "QR Tiket untuk pesanan ini tidak berlaku lagi.",
      `Pesan ulang: ${input.siteUrl}`,
    ].join("\n\n"),
  };
}

/** ORDER_CANCELLED — pesanan dibatalkan admin (ADM-09). */
export function orderCancelledEmail(input: {
  event: EventSummary;
  orderCode: string;
}): EmailContent {
  const html = layout(
    input.event,
    `<h1 style="margin:0;font-size:22px">Pesanan dibatalkan</h1>
<p style="margin:12px 0 0;font-size:14px;line-height:22px">Pesanan <strong style="font-family:'Courier New',monospace">${escapeHtml(input.orderCode)}</strong> dibatalkan oleh penyelenggara. Hubungi penyelenggara untuk informasi lebih lanjut.</p>`,
  );
  return {
    subject: `Pesanan ${input.orderCode} dibatalkan — ${input.event.name}`,
    html,
    text: `Pesanan ${input.orderCode} untuk ${input.event.name} dibatalkan oleh penyelenggara. Hubungi penyelenggara untuk informasi lebih lanjut.`,
  };
}

/** ADMIN_INVITE — undangan Admin event (OWN-10, ADM-01). */
export function adminInviteEmail(input: {
  eventName: string;
  inviteeName: string;
  acceptUrl: string;
  expiresLabel: string;
}): EmailContent {
  const event: EventSummary = {
    name: input.eventName,
    dateLabel: "",
    timeRange: null,
    venue: null,
    mapsUrl: null,
    primaryColor: null,
    contact: null,
  };
  const html = layout(
    event,
    `<h1 style="margin:0;font-size:22px">Undangan Admin Event</h1>
<p style="margin:12px 0 0;font-size:14px;line-height:22px">Halo ${escapeHtml(input.inviteeName)}, kamu diundang menjadi admin untuk event <strong>${escapeHtml(input.eventName)}</strong> di Uncle.</p>
<p style="margin:20px 0;text-align:center"><a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Aktifkan Akun</a></p>
<p style="margin:0;font-size:13px;color:#475569">Link berlaku sampai ${escapeHtml(input.expiresLabel)}. Abaikan email ini bila kamu tidak merasa diundang.</p>`,
  );
  return {
    subject: `Undangan admin event ${input.eventName}`,
    html,
    text: [
      `Halo ${input.inviteeName}, kamu diundang menjadi admin untuk event ${input.eventName} di Uncle.`,
      `Aktifkan akun: ${input.acceptUrl}`,
      `Link berlaku sampai ${input.expiresLabel}.`,
    ].join("\n\n"),
  };
}

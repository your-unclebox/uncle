import "server-only";

import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";

import type { EmailMessage } from "@/integrations/email/email-sender";
import {
  adminInviteEmail,
  cashReservationEmail,
  orderCancelledEmail,
  reservationExpiredEmail,
  TICKET_QR_CID,
  ticketIssuedEmail,
  type EmailContent,
  type EventSummary,
} from "@/integrations/email/templates/templates";
import { formatTimeRange, toLocalParts } from "@/lib/event-time";
import { formatEventDay } from "@/lib/format";
import { siteOrigin } from "@/lib/host";
import type { DatabaseExecutor } from "@/server/db/client";
import { emailOutbox, events, invitations, orderItems, orders, tickets } from "@/server/db/schema";
import { signLookupToken } from "@/server/modules/ordering/order-access";
import { rebuildTicketQrPayload } from "@/server/modules/ticketing";

type OutboxRow = typeof emailOutbox.$inferSelect;
type EventRow = typeof events.$inferSelect;

export interface ComposeDeps {
  readonly qrSigningKey: Buffer;
  /** Origin dashboard (link undangan), mis. https://app.uncle.id. */
  readonly appUrl: string;
  /** Domain landing, mis. uncle.id → https://{slug}.uncle.id. */
  readonly baseDomain: string;
  /** Alamat pengirim, mis. tiket@mail.uncle.id. */
  readonly fromAddress: string;
  readonly now: Date;
}

/** Email siap kirim, atau alasan tidak bisa dikirim (dicatat sebagai FAILED). */
export type Composed = { ok: true; message: EmailMessage } | { ok: false; reason: string };

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// From: "{Nama Event} via Uncle" <tiket@mail.uncle.id> (DRD Integrations §2).
function fromHeader(displayName: string, address: string): string {
  const safe = displayName.replace(/["\\\r\n]/g, "").slice(0, 80);
  return `"${safe} via Uncle" <${address}>`;
}

function siteUrl(event: EventRow, baseDomain: string): string {
  const host = baseDomain.replace(/:\d+$/, "");
  const protocol = host.endsWith("localhost") ? "http" : "https";
  return siteOrigin(event.slug ?? "", baseDomain, protocol);
}

function eventSummary(event: EventRow): EventSummary {
  return {
    name: event.name,
    dateLabel: formatEventDay(event.startsAt, event.timezone),
    timeRange:
      event.startsAt && event.endsAt
        ? formatTimeRange(event.startsAt, event.endsAt, event.timezone)
        : null,
    venue: [event.venueName, event.venueAddress].filter(Boolean).join(", ") || null,
    mapsUrl: event.mapsUrl,
    primaryColor: event.primaryColor,
    contact: event.contactInfo,
  };
}

function deadlineLabel(date: Date | null, event: EventRow): string | null {
  if (!date) return null;
  return `${formatEventDay(date, event.timezone)} ${toLocalParts(date, event.timezone).time} WIB`;
}

function message(
  row: OutboxRow,
  content: EmailContent,
  event: EventRow,
  deps: ComposeDeps,
  attachments: EmailMessage["attachments"] = [],
): Composed {
  const replyTo = event.contactInfo?.match(EMAIL_PATTERN)?.[0];
  return {
    ok: true,
    message: {
      from: fromHeader(event.name, deps.fromAddress),
      to: row.toEmail,
      ...(replyTo ? { replyTo } : {}),
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments,
      idempotencyKey: `email-outbox-${row.id}`,
    },
  };
}

async function composeOrderEmail(
  db: DatabaseExecutor,
  row: OutboxRow,
  event: EventRow,
  deps: ComposeDeps,
): Promise<Composed> {
  if (!row.orderId) return { ok: false, reason: "Email order tanpa order_id" };
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.eventId, row.eventId), eq(orders.id, row.orderId)));
  if (!order) return { ok: false, reason: "Order tidak ditemukan" };

  if (row.type === "RESERVATION_EXPIRED") {
    const content = reservationExpiredEmail({
      event: eventSummary(event),
      orderCode: order.orderCode,
      siteUrl: siteUrl(event, deps.baseDomain),
    });
    return message(row, content, event, deps);
  }
  if (row.type === "ORDER_CANCELLED") {
    const content = orderCancelledEmail({ event: eventSummary(event), orderCode: order.orderCode });
    return message(row, content, event, deps);
  }

  // TICKET_ISSUED / CASH_RESERVATION: QR Tiket harus masih aktif.
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.eventId, row.eventId), eq(tickets.orderId, order.id)));
  if (!ticket || ticket.status === "VOID") return { ok: false, reason: "QR Tiket tidak aktif" };
  if (row.type === "CASH_RESERVATION" && order.status !== "RESERVED") {
    return { ok: false, reason: `Order sudah ${order.status}` };
  }
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.eventId, row.eventId), eq(orderItems.orderId, order.id)));

  // Link cadangan bila gambar diblokir: token Cek Pesanan (berlaku s/d event selesai + 24 jam).
  const accessToken = signLookupToken(deps.qrSigningKey, order, {
    eventEndsAt: event.endsAt,
    now: deps.now,
  });
  const orderUrl = `${siteUrl(event, deps.baseDomain)}/pesanan/${order.orderCode}?t=${accessToken}`;
  const summary = {
    code: order.orderCode,
    items: items.map((item) => ({
      name: item.ticketTypeName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    })),
    totalAmount: Number(order.totalAmount),
  };
  const content =
    row.type === "TICKET_ISSUED"
      ? ticketIssuedEmail({ event: eventSummary(event), order: summary, orderUrl })
      : cashReservationEmail({
          event: eventSummary(event),
          order: summary,
          orderUrl,
          reservationDeadline: deadlineLabel(order.expiresAt, event),
        });
  const qrPng = await QRCode.toBuffer(rebuildTicketQrPayload(ticket, deps.qrSigningKey), {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 480,
  });
  return message(row, content, event, deps, [
    {
      filename: `tiket-${order.orderCode}.png`,
      content: qrPng,
      contentType: "image/png",
      contentId: TICKET_QR_CID,
    },
  ]);
}

async function composeInviteEmail(
  db: DatabaseExecutor,
  row: OutboxRow,
  event: EventRow,
  deps: ComposeDeps,
): Promise<Composed> {
  const payload = (row.payload ?? {}) as { invitationId?: string; token?: string };
  if (!payload.invitationId || !payload.token) {
    return { ok: false, reason: "Token undangan tidak tersedia" };
  }
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.eventId, row.eventId), eq(invitations.id, payload.invitationId)));
  if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
    return { ok: false, reason: "Undangan tidak aktif" };
  }
  if (invitation.expiresAt <= deps.now) return { ok: false, reason: "Undangan kedaluwarsa" };
  const content = adminInviteEmail({
    eventName: event.name,
    inviteeName: invitation.name,
    acceptUrl: `${deps.appUrl.replace(/\/$/, "")}/undangan/${payload.token}`,
    expiresLabel: formatEventDay(invitation.expiresAt, "Asia/Jakarta"),
  });
  return message(row, content, { ...event, contactInfo: null }, deps);
}

/** Susun email dari baris outbox (DRD Integrations §2). Job lintas tenant (koneksi owner). */
export async function composeOutboxEmail(
  db: DatabaseExecutor,
  row: OutboxRow,
  deps: ComposeDeps,
): Promise<Composed> {
  const [event] = await db.select().from(events).where(eq(events.id, row.eventId));
  if (!event) return { ok: false, reason: "Event tidak ditemukan" };
  if (row.type === "ADMIN_INVITE") return composeInviteEmail(db, row, event, deps);
  return composeOrderEmail(db, row, event, deps);
}

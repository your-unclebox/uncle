import "server-only";

import { getDb } from "@/server/db/client";
import {
  checkInTicket,
  confirmCashPayment,
  getAdminOrderDetail,
  getAdminSummary,
  listAdminOrders,
  reissueExpiredOrder,
  scanTicket,
} from "@/server/modules/ordering";
import { findTicketEventId, getQrSigningKey } from "@/server/modules/ticketing";
import { withTenant } from "@/server/tenancy";

import { kickEmailOutbox } from "./email-dispatch";
import { readJson } from "./request";
import { authenticateEventAdmin } from "./route";

// Admin Dashboard & Scan Tiket (DRD API §5, ADM-03..06, SCN-02..08).
// Tenant dari path {eventId} + membership, tidak pernah dari query/body (I-1).

export async function getEventSummary(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return withTenant(getDb(), tenant, (repo) => getAdminSummary(repo));
}

export async function getEventOrders(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return withTenant(getDb(), tenant, (repo) => listAdminOrders(repo, query));
}

export async function getEventOrder(request: Request, eventId: string, orderId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return withTenant(getDb(), tenant, (repo) => getAdminOrderDetail(repo, orderId));
}

export async function scanEventTicket(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const body = await readJson(request);
  const db = getDb();
  return withTenant(db, tenant, (repo) =>
    scanTicket(repo, body, {
      qrSigningKey: getQrSigningKey(),
      lookupTicketEventId: (ticketId) => findTicketEventId(db, ticketId),
    }),
  );
}

export async function confirmEventCash(request: Request, eventId: string, orderId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const body = await readJson(request);
  return withTenant(getDb(), tenant, (repo) => confirmCashPayment(repo, orderId, body));
}

export async function checkInEventTicket(request: Request, eventId: string, ticketId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return withTenant(getDb(), tenant, (repo) => checkInTicket(repo, ticketId));
}

/** POST …/orders/{orderId}/reissue (D7, SCN-08) — respons 201 sesuai contoh DRD API §5. */
export async function reissueEventOrder(request: Request, eventId: string, orderId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const body = await readJson(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const input = {
    ...(body && typeof body === "object" ? body : {}),
    orderId,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
  const result = await withTenant(getDb(), tenant, async (repo) => {
    const reissued = await reissueExpiredOrder(repo, input, { qrSigningKey: getQrSigningKey() });
    const oldOrder = await getAdminOrderDetail(repo, orderId);
    return { reissued, oldCode: oldOrder.code };
  });
  if (!result.reissued.replayed) kickEmailOutbox();
  const { order, items, ticket } = result.reissued;
  return {
    order: {
      id: order.id,
      code: order.orderCode,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paidVia: order.paidVia,
      reissuedFromOrderCode: result.oldCode,
      totalAmount: order.totalAmount,
      items: items.map((item) => ({
        name: item.ticketTypeName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
    ticket: { id: ticket.id, status: ticket.status },
    actions: { canCheckIn: ticket.status === "ISSUED" },
  };
}

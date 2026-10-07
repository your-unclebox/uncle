import "server-only";

import { getDb } from "@/server/db/client";
import {
  confirmCashPayment,
  getAdminOrderDetail,
  getEventSummary,
  listAdminOrders,
  OrderNotFoundError,
  reissueExpiredOrder,
} from "@/server/modules/ordering";
import {
  checkInTicket,
  describeOrderForScanner,
  getQrSigningKey,
  scanTicket,
} from "@/server/modules/ticketing";
import { withTenant } from "@/server/tenancy";

import { kickEmailOutbox } from "./email-dispatch";
import { readJson } from "./request";
import { authenticateEventAdmin } from "./route";

// Admin Dashboard & Scanner (DRD API §5). eventId selalu dari path + membership.

export async function adminSummary(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return withTenant(getDb(), tenant, (repo) => getEventSummary(repo));
}

export async function adminOrderList(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const params = new URL(request.url).searchParams;
  const query = Object.fromEntries([...params].filter(([, value]) => value !== ""));
  return withTenant(getDb(), tenant, (repo) => listAdminOrders(repo, query));
}

export async function adminOrderDetail(request: Request, eventId: string, orderId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return withTenant(getDb(), tenant, (repo) => getAdminOrderDetail(repo, orderId));
}

/** Konfirmasi Lunas lalu kembalikan panel Scanner terbaru (UI-UX Scan (e)). */
export async function adminConfirmCash(request: Request, eventId: string, orderId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const body = await readJson(request);
  const now = new Date();
  return withTenant(getDb(), tenant, async (repo) => {
    await confirmCashPayment(repo, orderId, body, { now });
    return describeOrderForScanner(repo, orderId, now);
  });
}

/**
 * Buat pesanan baru dari reservasi Cash kedaluwarsa (D7). Respons DRD API §5
 * + `view` panel Scanner pesanan baru supaya admin bisa langsung Tandai Diambil.
 */
export async function adminReissue(request: Request, eventId: string, orderId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const body = await readJson(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const now = new Date();
  const result = await withTenant(getDb(), tenant, async (repo) => {
    if (!uuidLike(orderId)) throw new OrderNotFoundError();
    const created = await reissueExpiredOrder(
      repo,
      {
        ...(typeof body === "object" && body !== null ? body : {}),
        orderId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      { qrSigningKey: getQrSigningKey(), now },
    );
    const view = await describeOrderForScanner(repo, created.order.id, now);
    return { created, view };
  });
  if (!result.created.replayed) kickEmailOutbox();
  const { order, items, ticket } = result.created;
  return {
    order: {
      id: order.id,
      code: order.orderCode,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paidVia: order.paidVia,
      reissuedFromOrderCode: result.view.order?.reissuedFromOrderCode ?? null,
      totalAmount: order.totalAmount,
      items: items.map((item) => ({
        name: item.ticketTypeName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
    ticket: { id: ticket.id, status: ticket.status },
    actions: { canCheckIn: result.view.actions.canCheckIn },
    view: result.view,
  };
}

export async function adminScan(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return scanTicket(getDb(), tenant, await readJson(request), { qrSigningKey: getQrSigningKey() });
}

/** Tandai Tiket Diambil → panel terbaru (ALREADY_CHECKED_IN = sukses milik kita). */
export async function adminCheckIn(request: Request, eventId: string, ticketId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const now = new Date();
  return withTenant(getDb(), tenant, async (repo) => {
    const ticket = await checkInTicket(repo, ticketId, { now });
    return describeOrderForScanner(repo, ticket.orderId, now);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidLike = (value: string) => UUID.test(value);

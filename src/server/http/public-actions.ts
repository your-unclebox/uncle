import "server-only";

import { getServerEnv } from "@/config/env";
import { resolveHost } from "@/lib/host";
import { normalizeIndonesianPhone } from "@/lib/phone";
import { getDb } from "@/server/db/client";
import type { events } from "@/server/db/schema";
import { listPublicTicketTypes } from "@/server/modules/catalog";
import { RateLimitedError } from "@/server/modules/identity/errors";
import {
  createCashOrder,
  EventNotFoundError,
  getCustomerOrder,
  lookupCustomerOrder,
  OrderNotFoundError,
  PaymentMethodUnavailableError,
  publicOrderRequestSchema,
} from "@/server/modules/ordering";
import { getQrSigningKey } from "@/server/modules/ticketing";
import { findPublicEventBySlug, toPublicEvent } from "@/server/modules/tenancy";
import { withTenant, type TenantScopedRepository } from "@/server/tenancy";

import { getRateLimiter } from "./rate-limit";
import { clientIp, readJson } from "./request";
import { parseInput } from "./validation-error";

// Public API customer (DRD API §2). Tenant SELALU dari Host header, bukan body.

type EventRow = typeof events.$inferSelect;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Slug → event publik → transaksi tenant (RLS aktif). */
async function withStorefront<T>(
  request: Request,
  work: (event: EventRow, repo: TenantScopedRepository) => Promise<T>,
): Promise<T> {
  const hostHeader = request.headers.get("host") ?? new URL(request.url).host;
  const host = resolveHost(hostHeader, getServerEnv().APP_BASE_DOMAIN);
  if (host.kind !== "site") throw new EventNotFoundError();
  const event = await findPublicEventBySlug(getDb(), host.slug);
  if (!event) throw new EventNotFoundError();
  return withTenant(getDb(), { eventId: event.id }, (repo) => work(event, repo));
}

// Batas per kunci (DRD Security §4). Masih in-memory (lihat rate-limit.ts).
async function limit(key: string, max: number, windowMs: number): Promise<void> {
  const result = await getRateLimiter().consume(key, max, windowMs);
  if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
}

const ipKey = (request: Request) => clientIp(request) ?? "unknown";

export async function getStorefrontEvent(request: Request) {
  await limit(`public:read:${ipKey(request)}`, 60, MINUTE);
  return withStorefront(request, async (event) => ({ event: toPublicEvent(event, new Date()) }));
}

export async function getStorefrontTicketTypes(request: Request) {
  await limit(`public:read:${ipKey(request)}`, 60, MINUTE);
  return withStorefront(request, async (_event, repo) => ({
    data: await listPublicTicketTypes(repo),
  }));
}

/** POST /api/public/orders — Cash: RESERVED + QR Tiket (DRD Architecture §5.2). */
export async function placePublicOrder(request: Request) {
  const ip = ipKey(request);
  await limit(`public:order:ip-min:${ip}`, 10, MINUTE);
  await limit(`public:order:ip-hour:${ip}`, 30, HOUR);
  const input = parseInput(publicOrderRequestSchema, await readJson(request));
  const phone = normalizeIndonesianPhone(input.customer.phone);
  if (phone) await limit(`public:order:phone:${phone}`, 5, HOUR);

  // QRIS menyusul bersama integrasi Tripay (Fase 5).
  if (input.paymentMethod === "QRIS") throw new PaymentMethodUnavailableError("QRIS");

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  return withStorefront(request, async (_event, repo) => {
    const result = await createCashOrder(
      repo,
      {
        items: input.items,
        customer: input.customer,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      { qrSigningKey: getQrSigningKey(), ...withIp(clientIp(request)) },
    );
    return {
      order: {
        code: result.order.orderCode,
        status: result.order.status,
        paymentMethod: result.order.paymentMethod,
        totalAmount: Number(result.order.totalAmount),
        expiresAt: result.order.expiresAt?.toISOString() ?? null,
        items: result.items.map((item) => ({
          name: item.ticketTypeName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
      },
      ticket: { status: result.ticket.status, qrPayload: result.qrPayload },
      accessToken: result.accessToken,
    };
  });
}

const withIp = (ip: string | null) => (ip ? { createdIp: ip } : {});

// Token akses: `Authorization: Bearer …` atau `?t=` (link email).
function accessTokenFrom(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer ?? new URL(request.url).searchParams.get("t");
}

export async function getPublicOrder(request: Request, orderCode: string) {
  await limit(`public:order-status:${orderCode.toUpperCase()}`, 30, MINUTE);
  return withStorefront(request, async (_event, repo) => {
    const order = await getCustomerOrder(
      repo,
      { orderCode, accessToken: accessTokenFrom(request) },
      { qrSigningKey: getQrSigningKey(), now: new Date() },
    );
    // Endpoint status tidak membawa QR; QR lewat …/ticket (DRD API §2).
    const { ticket, ...rest } = order;
    return {
      order: {
        ...rest,
        ticket: ticket ? { status: ticket.status, checkedInAt: ticket.checkedInAt } : null,
      },
    };
  });
}

export async function getPublicOrderTicket(request: Request, orderCode: string) {
  await limit(`public:order-ticket:${orderCode.toUpperCase()}`, 30, MINUTE);
  return withStorefront(request, async (_event, repo) => {
    const order = await getCustomerOrder(
      repo,
      { orderCode, accessToken: accessTokenFrom(request) },
      { qrSigningKey: getQrSigningKey(), now: new Date() },
    );
    if (!order.ticket?.qrPayload) throw new OrderNotFoundError();
    return { order };
  });
}

/** Cek Pesanan: kode pesanan + no HP → token akses baru (LP-11). */
export async function lookupPublicOrder(request: Request) {
  await limit(`public:lookup:ip:${ipKey(request)}`, 5, MINUTE);
  const body = await readJson(request);
  const code =
    typeof body === "object" && body && "orderCode" in body && typeof body.orderCode === "string"
      ? body.orderCode.trim().toUpperCase()
      : "";
  if (code) await limit(`public:lookup:code:${code}`, 10, HOUR);
  return withStorefront(request, (_event, repo) =>
    lookupCustomerOrder(repo, body, { qrSigningKey: getQrSigningKey(), now: new Date() }),
  );
}

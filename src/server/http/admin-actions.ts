import "server-only";

import { getDb } from "@/server/db/client";
import { getAdminOrderDetail, getAdminSummary, listAdminOrders } from "@/server/modules/ordering";
import { withTenant } from "@/server/tenancy";

import { authenticateEventAdmin } from "./route";

// Admin Dashboard: Ringkasan, Daftar & Detail Transaksi (DRD API §5, ADM-03..06).
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

import { reissueEventOrder } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders/[orderId]/reissue">;

// POST — Buat Pesanan Baru dari reservasi Cash kedaluwarsa (D7, SCN-08); Idempotency-Key.
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId, orderId } = await ctx.params;
  return json(await reissueEventOrder(request, eventId, orderId), { status: 201 });
});

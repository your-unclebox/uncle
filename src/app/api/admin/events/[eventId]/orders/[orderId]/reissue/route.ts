import { adminReissue } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders/[orderId]/reissue">;

// POST — pesanan baru Lunas dari reservasi Cash kedaluwarsa (SCN-08, D7).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId, orderId } = await ctx.params;
  return json(await adminReissue(request, eventId, orderId), { status: 201 });
});

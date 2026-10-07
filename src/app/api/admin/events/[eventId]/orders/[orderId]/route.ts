import { adminOrderDetail } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders/[orderId]">;

// GET — detail + item + riwayat (ADM-06).
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId, orderId } = await ctx.params;
  return json(await adminOrderDetail(request, eventId, orderId));
});

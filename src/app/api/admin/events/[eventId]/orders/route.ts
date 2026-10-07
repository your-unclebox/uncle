import { adminOrderList } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders">;

// GET — daftar transaksi + filter status/pickup/method/q (ADM-04/05).
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await adminOrderList(request, eventId));
});

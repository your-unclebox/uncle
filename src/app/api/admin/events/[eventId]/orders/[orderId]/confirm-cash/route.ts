import { confirmEventCash } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders/[orderId]/confirm-cash">;

// POST — Konfirmasi Lunas Cash `{ cashReceived: true }`: RESERVED → PAID (SCN-04).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId, orderId } = await ctx.params;
  return json(await confirmEventCash(request, eventId, orderId));
});

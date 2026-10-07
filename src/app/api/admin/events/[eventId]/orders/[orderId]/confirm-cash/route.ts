import { adminConfirmCash } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders/[orderId]/confirm-cash">;

// POST — Cash RESERVED → PAID setelah "Sudah terima uang" (SCN-04, BR-PAY-04).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId, orderId } = await ctx.params;
  return json(await adminConfirmCash(request, eventId, orderId));
});

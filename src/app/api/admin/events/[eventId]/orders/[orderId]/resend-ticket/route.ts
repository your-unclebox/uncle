import { adminResendTicket } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/orders/[orderId]/resend-ticket">;

// POST — Kirim Ulang email QR Tiket untuk pesanan Lunas (ADM-08).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId, orderId } = await ctx.params;
  return json(await adminResendTicket(request, eventId, orderId));
});

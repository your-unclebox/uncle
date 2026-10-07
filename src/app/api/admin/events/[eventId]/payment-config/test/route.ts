import { json } from "@/server/http/json";
import { testPaymentConfig } from "@/server/http/payment-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/payment-config/test">;

// POST — "Uji Ulang" koneksi.
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await testPaymentConfig(request, eventId));
});

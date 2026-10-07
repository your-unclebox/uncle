import { json } from "@/server/http/json";
import { getPaymentConfig, putPaymentConfig } from "@/server/http/payment-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/payment-config">;

// GET — status & data termasking (tidak pernah mengembalikan secret).
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await getPaymentConfig(request, eventId));
});

// PUT — simpan kredensial → enkripsi → uji koneksi (ADM-07).
export const PUT = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await putPaymentConfig(request, eventId));
});

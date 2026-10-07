import { json } from "@/server/http/json";
import { getPublicOrderTicket } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/public/orders/[orderCode]/ticket">;

// GET /api/public/orders/{orderCode}/ticket — QR Tiket (hanya bila tiket aktif).
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { orderCode } = await ctx.params;
  return json(await getPublicOrderTicket(request, orderCode));
});

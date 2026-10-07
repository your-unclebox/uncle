import { json } from "@/server/http/json";
import { getPublicOrder } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/public/orders/[orderCode]">;

// GET /api/public/orders/{orderCode} — status order; butuh Bearer token atau ?t=.
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { orderCode } = await ctx.params;
  return json(await getPublicOrder(request, orderCode));
});

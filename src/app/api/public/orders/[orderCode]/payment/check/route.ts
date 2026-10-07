import { json } from "@/server/http/json";
import { checkPublicOrderPayment } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/public/orders/[orderCode]/payment/check">;

// POST — paksa cek status ke gateway (tombol "Cek Status" Step 4).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { orderCode } = await ctx.params;
  return json(await checkPublicOrderPayment(request, orderCode));
});

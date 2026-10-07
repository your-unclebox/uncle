import { json } from "@/server/http/json";
import { getPaymentConfig } from "@/server/http/payment-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/payment-config/webhook-url">;

// GET — URL callback untuk didaftarkan di dashboard gateway bila diperlukan.
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  const { webhookUrl } = await getPaymentConfig(request, eventId);
  return json({ webhookUrl });
});

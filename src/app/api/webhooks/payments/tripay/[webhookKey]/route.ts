import { kickEmailOutbox } from "@/server/http/email-dispatch";
import { json } from "@/server/http/json";
import { receiveTripayWebhook } from "@/server/http/payment-actions";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/webhooks/payments/tripay/[webhookKey]">;

// POST — callback status pembayaran Tripay (DRD API §6). Diverifikasi
// signature, bukan session; 200 {"success": true} bila diterima/duplikat.
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { webhookKey } = await ctx.params;
  const result = await receiveTripayWebhook(request, webhookKey);
  kickEmailOutbox();
  return json(result.body, { status: result.status });
});

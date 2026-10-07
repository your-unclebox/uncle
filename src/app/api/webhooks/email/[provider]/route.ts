import { receiveEmailWebhook } from "@/server/http/email-dispatch";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/webhooks/email/[provider]">;

// POST — event email dari provider (delivered/bounced/complained), diverifikasi signature.
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { provider } = await ctx.params;
  const result = await receiveEmailWebhook(request, provider);
  return json(result.body, { status: result.status });
});

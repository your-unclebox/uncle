import { runCronJob } from "@/server/http/cron-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/internal/cron/[job]">;

// POST — dipanggil scheduler (expire-orders, reconcile-qris). Butuh CRON_SECRET.
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { job } = await ctx.params;
  return json(await runCronJob(request, job));
});

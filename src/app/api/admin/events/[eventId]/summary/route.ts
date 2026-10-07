import { adminSummary } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/summary">;

// GET — Terjual, Lunas, Belum, Diambil (ADM-03).
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await adminSummary(request, eventId));
});

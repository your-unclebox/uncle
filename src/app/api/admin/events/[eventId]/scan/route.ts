import { adminScan } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/scan">;

// POST — validasi QR Tiket / kode pesanan manual (SCN-02, SCN-05, SCN-06).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await adminScan(request, eventId));
});

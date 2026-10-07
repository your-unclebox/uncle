import { scanEventTicket } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/scan">;

// POST — validasi QR Tiket `{ payload }` atau kode manual `{ orderCode }` (SCN-02/05/06/08).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json(await scanEventTicket(request, eventId));
});

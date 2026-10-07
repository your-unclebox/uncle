import { checkInEventTicket } from "@/server/http/admin-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

type Ctx = RouteContext<"/api/admin/events/[eventId]/tickets/[ticketId]/check-in">;

// POST — Tandai Tiket Diambil, atomik (SCN-03/07, I-9).
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId, ticketId } = await ctx.params;
  return json(await checkInEventTicket(request, eventId, ticketId));
});

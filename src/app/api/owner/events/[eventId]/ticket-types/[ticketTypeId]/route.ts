import { json, noContent } from "@/server/http/json";
import { readJson } from "@/server/http/request";
import { route, withOwnerEvent } from "@/server/http/route";
import { deleteTicketType, updateTicketType } from "@/server/modules/catalog";

type Ctx = RouteContext<"/api/owner/events/[eventId]/ticket-types/[ticketTypeId]">;

// PATCH — ubah nama/harga/kuota/aktif (kuota < terjual → 409).
export const PATCH = route(async (request: Request, ctx: Ctx) => {
  const { eventId, ticketTypeId } = await ctx.params;
  const body = await readJson(request);
  return json(
    await withOwnerEvent(request, eventId, (repo) => updateTicketType(repo, ticketTypeId, body)),
  );
});

// DELETE — hanya bila belum pernah dipesan (BR-EVT-07).
export const DELETE = route(async (request: Request, ctx: Ctx) => {
  const { eventId, ticketTypeId } = await ctx.params;
  await withOwnerEvent(request, eventId, (repo) => deleteTicketType(repo, ticketTypeId));
  return noContent();
});

import { json } from "@/server/http/json";
import { readJson } from "@/server/http/request";
import { route, withOwnerEvent } from "@/server/http/route";
import { createTicketType, listTicketTypes } from "@/server/modules/catalog";

type Ctx = RouteContext<"/api/owner/events/[eventId]/ticket-types">;

// GET /api/owner/events/{eventId}/ticket-types (OWN-07)
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  return json({ data: await withOwnerEvent(request, eventId, listTicketTypes) });
});

// POST /api/owner/events/{eventId}/ticket-types
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  const body = await readJson(request);
  return json(await withOwnerEvent(request, eventId, (repo) => createTicketType(repo, body)), {
    status: 201,
  });
});

import { json } from "@/server/http/json";
import { readIfMatchVersion, readJson } from "@/server/http/request";
import { route, withOwnerEvent } from "@/server/http/route";
import { EventNotFoundError } from "@/server/modules/ordering/errors";
import { toEventForm, updateEventDetails } from "@/server/modules/tenancy";

type Ctx = RouteContext<"/api/owner/events/[eventId]">;

// GET /api/owner/events/{eventId} — data form edit.
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  const event = await withOwnerEvent(request, eventId, (repo) => repo.getEvent());
  if (!event) throw new EventNotFoundError();
  return json(toEventForm(event));
});

// PATCH /api/owner/events/{eventId} — wajib If-Match: {version}.
export const PATCH = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  const version = readIfMatchVersion(request);
  const body = await readJson(request);
  const event = await withOwnerEvent(request, eventId, (repo) =>
    updateEventDetails(repo, body, version),
  );
  return json(toEventForm(event));
});

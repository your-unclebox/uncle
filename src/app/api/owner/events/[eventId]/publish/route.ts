import { json } from "@/server/http/json";
import { route, withOwnerEvent } from "@/server/http/route";
import { publishEvent, toEventForm } from "@/server/modules/tenancy";

// POST /api/owner/events/{eventId}/publish — Draft → Aktif (OWN-09).
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/owner/events/[eventId]/publish">) => {
    const { eventId } = await ctx.params;
    const event = await withOwnerEvent(request, eventId, (repo, auth) =>
      publishEvent(repo, { actorUserId: auth.user.id }),
    );
    return json(toEventForm(event));
  },
);

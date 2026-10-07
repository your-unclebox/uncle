import { json } from "@/server/http/json";
import { route, withOwnerEvent } from "@/server/http/route";
import { getPublishChecklist } from "@/server/modules/tenancy";

// GET /api/owner/events/{eventId}/publish-checklist
export const GET = route(
  async (request: Request, ctx: RouteContext<"/api/owner/events/[eventId]/publish-checklist">) => {
    const { eventId } = await ctx.params;
    return json({ items: await withOwnerEvent(request, eventId, getPublishChecklist) });
  },
);

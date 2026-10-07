import { json } from "@/server/http/json";
import { readJson } from "@/server/http/request";
import { route, withOwnerEvent } from "@/server/http/route";
import { setEventSlug } from "@/server/modules/tenancy";

// PUT /api/owner/events/{eventId}/slug (OWN-08, BR-EVT-06)
export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/owner/events/[eventId]/slug">) => {
    const { eventId } = await ctx.params;
    const body = await readJson(request);
    return json({
      slug: await withOwnerEvent(request, eventId, (repo) => setEventSlug(repo, body)),
    });
  },
);

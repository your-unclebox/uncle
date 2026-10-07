import { json } from "@/server/http/json";
import { route, withOwnerEvent } from "@/server/http/route";
import { listAdminAccess } from "@/server/modules/identity";

// GET /api/owner/events/{eventId}/members — admin aktif.
export const GET = route(
  async (request: Request, ctx: RouteContext<"/api/owner/events/[eventId]/members">) => {
    const { eventId } = await ctx.params;
    const rows = await withOwnerEvent(request, eventId, (repo) => listAdminAccess(repo));
    return json({ data: rows.filter((row) => row.kind === "MEMBER") });
  },
);

import { noContent } from "@/server/http/json";
import { route, withOwnerEvent } from "@/server/http/route";
import { revokeMembership } from "@/server/modules/identity";

// DELETE — cabut akses admin.
export const DELETE = route(
  async (
    request: Request,
    ctx: RouteContext<"/api/owner/events/[eventId]/members/[membershipId]">,
  ) => {
    const { eventId, membershipId } = await ctx.params;
    await withOwnerEvent(request, eventId, (repo) => revokeMembership(repo, membershipId));
    return noContent();
  },
);

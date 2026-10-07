import { noContent } from "@/server/http/json";
import { route, withOwnerEvent } from "@/server/http/route";
import { revokeInvitation } from "@/server/modules/identity";

// POST — cabut undangan.
export const POST = route(
  async (
    request: Request,
    ctx: RouteContext<"/api/owner/events/[eventId]/invitations/[invitationId]/revoke">,
  ) => {
    const { eventId, invitationId } = await ctx.params;
    await withOwnerEvent(request, eventId, (repo) => revokeInvitation(repo, invitationId));
    return noContent();
  },
);

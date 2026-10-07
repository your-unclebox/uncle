import { json } from "@/server/http/json";
import { route, withOwnerEvent } from "@/server/http/route";
import { resendInvitation } from "@/server/modules/identity";

// POST — kirim ulang undangan: token baru, masa berlaku diperpanjang.
export const POST = route(
  async (
    request: Request,
    ctx: RouteContext<"/api/owner/events/[eventId]/invitations/[invitationId]/resend">,
  ) => {
    const { eventId, invitationId } = await ctx.params;
    const { invitation, token } = await withOwnerEvent(request, eventId, (repo) =>
      resendInvitation(repo, invitationId),
    );
    return json({
      invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
      inviteUrl: `${new URL(request.url).origin}/undangan/${token}`,
    });
  },
);

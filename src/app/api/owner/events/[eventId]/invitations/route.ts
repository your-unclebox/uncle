import { json } from "@/server/http/json";
import { readJson } from "@/server/http/request";
import { route, withOwnerEvent } from "@/server/http/route";
import { inviteAdmin, invitationStatus, listAdminAccess } from "@/server/modules/identity";

type Ctx = RouteContext<"/api/owner/events/[eventId]/invitations">;

// GET — undangan yang belum diterima (Diundang / Kedaluwarsa).
export const GET = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  const rows = await withOwnerEvent(request, eventId, (repo) => listAdminAccess(repo));
  return json({ data: rows.filter((row) => row.kind === "INVITATION") });
});

// POST — undang admin (OWN-10). Link undangan dikembalikan sekali.
export const POST = route(async (request: Request, ctx: Ctx) => {
  const { eventId } = await ctx.params;
  const body = await readJson(request);
  const { invitation, token } = await withOwnerEvent(request, eventId, (repo, auth) =>
    inviteAdmin(repo, body, { invitedBy: auth.user.id }),
  );
  return json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        expiresAt: invitation.expiresAt,
        status: invitationStatus(invitation),
      },
      inviteUrl: `${new URL(request.url).origin}/undangan/${token}`,
    },
    { status: 201 },
  );
});

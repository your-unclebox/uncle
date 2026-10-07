import { acceptInvitationFromRequest } from "@/server/http/auth-actions";
import { json } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/request";
import { route } from "@/server/http/route";
import { sessionCookie } from "@/server/http/session-cookie";

// POST /api/auth/invitations/{token}/accept — set password, aktifkan akun, login.
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/auth/invitations/[token]/accept">) => {
    assertSameOrigin(request);
    const { token } = await ctx.params;
    const result = await acceptInvitationFromRequest(request, token);
    return json(
      { eventId: result.eventId },
      { headers: { "set-cookie": sessionCookie(result.token, result.expiresAt) } },
    );
  },
);

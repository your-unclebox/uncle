import { invitationInfo } from "@/server/http/auth-actions";
import { json } from "@/server/http/json";
import { route } from "@/server/http/route";

// GET /api/auth/invitations/{token} — info undangan untuk halaman aktivasi.
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/auth/invitations/[token]">) => {
    const { token } = await ctx.params;
    return json(await invitationInfo(token));
  },
);

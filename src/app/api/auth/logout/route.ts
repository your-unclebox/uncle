import { logoutFromRequest } from "@/server/http/auth-actions";
import { noContent } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/request";
import { route } from "@/server/http/route";
import { clearedSessionCookie } from "@/server/http/session-cookie";

// POST /api/auth/logout
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await logoutFromRequest(request);
  return noContent({ headers: { "set-cookie": clearedSessionCookie() } });
});

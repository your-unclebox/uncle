import { loginFromRequest } from "@/server/http/auth-actions";
import { json } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/request";
import { route } from "@/server/http/route";
import { sessionCookie } from "@/server/http/session-cookie";

// POST /api/auth/login (OWN-01, ADM-01).
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const result = await loginFromRequest(request);
  return json(
    { userId: result.userId },
    { headers: { "set-cookie": sessionCookie(result.token, result.expiresAt) } },
  );
});

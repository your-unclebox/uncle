import { UnauthenticatedError } from "@/server/modules/identity/errors";
import { json } from "@/server/http/json";
import { authenticate, route } from "@/server/http/route";

// GET /api/auth/me — user + role & event yang bisa diakses.
export const GET = route(async (request: Request) => {
  const auth = await authenticate(request);
  if (!auth) throw new UnauthenticatedError();
  return json({ user: auth.user, isOwner: auth.isOwner, adminEventIds: auth.adminEventIds });
});

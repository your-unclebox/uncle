import { json } from "@/server/http/json";
import { ownerSummary } from "@/server/http/owner-actions";
import { route } from "@/server/http/route";

// GET /api/owner/summary (OWN-02)
export const GET = route(async (request: Request) => json(await ownerSummary(request)));

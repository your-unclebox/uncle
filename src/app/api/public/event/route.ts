import { json } from "@/server/http/json";
import { getStorefrontEvent } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

// GET /api/public/event — detail event dari Host (LP-01). DRAFT/tidak ada → 404.
export const GET = route(async (request: Request) => json(await getStorefrontEvent(request)));

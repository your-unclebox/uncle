import { json } from "@/server/http/json";
import { getStorefrontTicketTypes } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

// GET /api/public/ticket-types — harga & kuota tersisa (no-store, LP-06).
export const GET = route(async (request: Request) => json(await getStorefrontTicketTypes(request)));

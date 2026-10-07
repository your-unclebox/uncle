import { json } from "@/server/http/json";
import { placePublicOrder } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

// POST /api/public/orders — checkout (LP-08). Header Idempotency-Key disarankan.
export const POST = route(async (request: Request) =>
  json(await placePublicOrder(request), { status: 201 }),
);

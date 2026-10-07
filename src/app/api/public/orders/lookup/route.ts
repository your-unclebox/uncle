import { json } from "@/server/http/json";
import { lookupPublicOrder } from "@/server/http/public-actions";
import { route } from "@/server/http/route";

// POST /api/public/orders/lookup — Cek Pesanan: {orderCode, phone} → accessToken (LP-11).
export const POST = route(async (request: Request) => json(await lookupPublicOrder(request)));

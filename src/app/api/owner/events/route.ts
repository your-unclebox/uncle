import { json } from "@/server/http/json";
import { ownerCreateEvent, ownerEventList } from "@/server/http/owner-actions";
import { route } from "@/server/http/route";
import { toEventForm } from "@/server/modules/tenancy";

// GET /api/owner/events?q=&status= (OWN-03)
export const GET = route(async (request: Request) => json({ data: await ownerEventList(request) }));

// POST /api/owner/events — buat event Draft (OWN-04, AC-OWN-04.1)
export const POST = route(async (request: Request) =>
  json(toEventForm(await ownerCreateEvent(request)), { status: 201 }),
);

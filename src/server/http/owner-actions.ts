import "server-only";

import { z } from "zod";

import { getDb } from "@/server/db/client";
import { eventStatus } from "@/server/db/schema";
import {
  checkSlugAvailability,
  createDraftEvent,
  getOwnerSummary,
  listOwnerEvents,
} from "@/server/modules/tenancy";

import { readJson } from "./request";
import { authenticateOwner } from "./route";
import { parseInput } from "./validation-error";

// Jembatan route handler → layanan Owner lintas tenant (tanpa DB di src/app).

export async function ownerSummary(request: Request) {
  await authenticateOwner(request);
  return getOwnerSummary(getDb());
}

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(eventStatus.enumValues).optional(),
});

export async function ownerEventList(request: Request) {
  await authenticateOwner(request);
  const params = new URL(request.url).searchParams;
  const query = parseInput(listQuerySchema, {
    q: params.get("q") || undefined,
    status: params.get("status") || undefined,
  });
  return listOwnerEvents(getDb(), query);
}

export async function ownerCreateEvent(request: Request) {
  const auth = await authenticateOwner(request);
  return createDraftEvent(getDb(), await readJson(request), { createdBy: auth.user.id });
}

export async function ownerSlugAvailability(request: Request, slug: string) {
  await authenticateOwner(request);
  return checkSlugAvailability(getDb(), slug.trim().toLowerCase());
}

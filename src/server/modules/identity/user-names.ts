import "server-only";

import { inArray } from "drizzle-orm";

import type { DatabaseTransaction } from "@/server/db/client";
import { users } from "@/server/db/schema";

/**
 * Nama admin yang menandai Lunas/Diambil (AC-SCN-03.1, AC-SCN-05.1). Hanya
 * kolom nama — tanpa email/hash — supaya aman dipakai di respons admin.
 */
export async function findUserNames(
  tx: DatabaseTransaction,
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

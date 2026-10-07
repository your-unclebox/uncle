import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/server/db/client";
import { resolveSession, type AuthContext } from "@/server/modules/identity";

import { SESSION_COOKIE } from "./session-cookie";

// Dibaca di dalam <Suspense> (Cache Components: cookies() = data request-time).
// connection(): validasi sesi bergantung waktu sekarang (expires/idle timeout),
// jadi hanya boleh berjalan saat request, bukan saat prerender.
export const getPageAuth = cache(async (): Promise<AuthContext | null> => {
  await connection();
  const store = await cookies();
  return resolveSession(getDb(), store.get(SESSION_COOKIE)?.value);
});

export type OwnerPageAccess = { kind: "ok"; auth: AuthContext } | { kind: "forbidden" };

/** Halaman Owner: belum login → /login; bukan Owner → akses ditolak (AC-OWN-01.3). */
export async function requireOwnerPage(): Promise<OwnerPageAccess> {
  const auth = await getPageAuth();
  if (!auth) redirect("/login");
  return auth.isOwner ? { kind: "ok", auth } : { kind: "forbidden" };
}

export async function requireAdminPage(eventId: string): Promise<AuthContext | null> {
  const auth = await getPageAuth();
  if (!auth) redirect("/login");
  return auth.adminEventIds.includes(eventId) ? auth : null;
}

import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { memberships, roles } from "@/server/db/schema";
import { hashPassword } from "@/server/modules/identity";

import { createUser } from "./db";

export const PASSWORD = "rahasia-uji-123";

async function roleId(db: Database, code: "OWNER" | "EVENT_ADMIN") {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, code));
  if (!role) throw new Error(`role ${code} tidak ada`);
  return role.id;
}

export async function createOwnerUser(db: Database) {
  const user = await createUser(db, { passwordHash: await hashPassword(PASSWORD), name: "Owner" });
  await db.insert(memberships).values({ userId: user.id, roleId: await roleId(db, "OWNER") });
  return user;
}

export async function createEventAdmin(db: Database, eventId: string) {
  const user = await createUser(db, { passwordHash: await hashPassword(PASSWORD) });
  await db
    .insert(memberships)
    .values({ userId: user.id, roleId: await roleId(db, "EVENT_ADMIN"), eventId });
  return user;
}

import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { APP_DB_ROLE } from "@/server/db/roles";
import { auditLogs, orderItems, orders, ticketTypes } from "@/server/db/schema";
import { MissingTenantContextError, withTenant } from "@/server/tenancy";

import { createEvent, createOrder, createTicketType, useTestDatabase } from "../fixtures/db";
import { expectPgError, PG } from "../fixtures/pg-error";

// BR-ACC-01 / AI-CODING-RULES I-1 & I-2: data satu tenant tidak pernah terlihat
// atau bisa diubah dari tenant lain.
describe("isolasi data antar-tenant", () => {
  const db = useTestDatabase();
  let eventA: Awaited<ReturnType<typeof createEvent>>;
  let eventB: Awaited<ReturnType<typeof createEvent>>;
  let orderA: Awaited<ReturnType<typeof createOrder>>;
  let orderB: Awaited<ReturnType<typeof createOrder>>;

  beforeAll(async () => {
    eventA = await createEvent(db, { name: "Teater Bagol" });
    eventB = await createEvent(db, { name: "Konser X" });
    orderA = await createOrder(db, eventA.id, { customerName: "Budi S." });
    orderB = await createOrder(db, eventB.id, { customerName: "Andi P." });
    await createTicketType(db, eventA.id, { name: "Reguler" });
    await createTicketType(db, eventB.id, { name: "VIP" });
  });

  describe("TenantScopedRepository", () => {
    it("hanya mengembalikan data milik tenant aktif", async () => {
      const rows = await withTenant(db, { eventId: eventA.id }, (repo) => repo.findMany(orders));
      expect(rows.map((row) => row.id)).toEqual([orderA.id]);

      const types = await withTenant(db, { eventId: eventA.id }, (repo) =>
        repo.findMany(ticketTypes),
      );
      expect(types.every((row) => row.eventId === eventA.id)).toBe(true);
      expect(types).toHaveLength(1);
    });

    it("resource tenant lain dianggap tidak ada (findFirst → undefined)", async () => {
      const row = await withTenant(db, { eventId: eventA.id }, (repo) =>
        repo.findFirst(orders, eq(orders.id, orderB.id)),
      );
      expect(row).toBeUndefined();
    });

    it("update & delete data tenant lain tidak menyentuh baris apa pun", async () => {
      const result = await withTenant(db, { eventId: eventA.id }, async (repo) => ({
        updated: await repo.update(orders, { needsReview: true }, eq(orders.id, orderB.id)),
        deleted: await repo.delete(orders, eq(orders.id, orderB.id)),
      }));
      expect(result.updated).toHaveLength(0);
      expect(result.deleted).toBe(0);

      const [stillThere] = await db.select().from(orders).where(eq(orders.id, orderB.id));
      expect(stillThere?.needsReview).toBe(false);
    });

    it("insert selalu memakai eventId dari konteks", async () => {
      const created = await withTenant(db, { eventId: eventA.id }, (repo) =>
        repo.insert(orders, {
          orderCode: `UNC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          customerName: "Dewi K.",
          customerPhone: "+6287855665566",
          customerEmail: "dewi@example.com",
          paymentMethod: "CASH",
          status: "RESERVED",
          totalAmount: 75_000n,
          expiresAt: eventA.endsAt,
        }),
      );
      expect(created.eventId).toBe(eventA.id);
    });

    it("menolak eventId yang diselundupkan lewat input insert/update", async () => {
      const smuggled = { eventId: eventB.id } as unknown as Parameters<
        Parameters<Parameters<typeof withTenant>[2]>[0]["update"]
      >[1];
      await expect(
        withTenant(db, { eventId: eventA.id }, (repo) =>
          repo.update(orders, smuggled, eq(orders.id, orderA.id)),
        ),
      ).rejects.toBeInstanceOf(MissingTenantContextError);
    });

    it("menolak konteks tanpa eventId yang valid sebelum menyentuh DB", async () => {
      await expect(withTenant(db, { eventId: "" }, async () => "x")).rejects.toBeInstanceOf(
        MissingTenantContextError,
      );
      await expect(
        withTenant(db, { eventId: "bukan-uuid" }, async () => "x"),
      ).rejects.toBeInstanceOf(MissingTenantContextError);
    });
  });

  describe("Row-Level Security (jaring pengaman kedua)", () => {
    it("query tanpa scope() di dalam withTenant tetap hanya melihat tenant aktif", async () => {
      const rows = await withTenant(db, { eventId: eventA.id }, (repo) =>
        repo.tx.select({ id: orders.id, eventId: orders.eventId }).from(orders),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.eventId === eventA.id)).toBe(true);
      expect(rows.some((row) => row.id === orderB.id)).toBe(false);
    });

    it("role aplikasi tanpa app.event_id tidak melihat baris apa pun", async () => {
      const rows = await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_DB_ROLE}`));
        return tx.select({ id: orders.id }).from(orders);
      });
      expect(rows).toHaveLength(0);
    });

    it("menolak insert order untuk tenant lain meski lewat transaksi mentah", async () => {
      await expectPgError(
        withTenant(db, { eventId: eventA.id }, (repo) =>
          repo.tx.insert(orders).values({
            eventId: eventB.id,
            orderCode: `UNC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            customerName: "Penyusup",
            customerPhone: "+6281200000000",
            customerEmail: "x@example.com",
            paymentMethod: "CASH",
            status: "RESERVED",
            totalAmount: 1n,
            expiresAt: eventB.endsAt,
          }),
        ),
        { code: PG.INSUFFICIENT_PRIVILEGE },
      );
    });

    it("audit_logs append-only untuk role aplikasi", async () => {
      await withTenant(db, { eventId: eventA.id }, (repo) =>
        repo.insert(auditLogs, { action: "TEST", entityType: "order", entityId: orderA.id }),
      );
      await expectPgError(
        withTenant(db, { eventId: eventA.id }, (repo) =>
          repo.tx.update(auditLogs).set({ action: "DIUBAH" }).where(repo.scope(auditLogs)),
        ),
        { code: PG.INSUFFICIENT_PRIVILEGE },
      );
    });
  });

  describe("relasi lintas tenant", () => {
    it("order_item tidak bisa memakai jenis tiket milik event lain", async () => {
      const ticketTypeB = await createTicketType(db, eventB.id);
      await expectPgError(
        db.insert(orderItems).values({
          eventId: eventA.id,
          orderId: orderA.id,
          ticketTypeId: ticketTypeB.id,
          quantity: 1,
          unitPrice: ticketTypeB.price,
          ticketTypeName: ticketTypeB.name,
        }),
        { code: PG.FOREIGN_KEY, constraint: "fk_order_items_ticket_type_same_event" },
      );
    });
  });
});

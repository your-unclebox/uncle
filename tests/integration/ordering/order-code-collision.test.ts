import { describe, expect, it, vi } from "vitest";

import { orders } from "@/server/db/schema";
import { insertOrderWithUniqueCode } from "@/server/modules/ordering/insert-order";

import { createEvent, createOrder, useTestDatabase } from "../../fixtures/db";

const codes = vi.hoisted(() => ({ queue: [] as string[] }));
vi.mock("@/server/modules/ordering/order-code", () => ({
  generateOrderCode: () => codes.queue.shift() ?? "UNC-ZZZZZZ",
}));

// DRD §Database 3.4: kode pesanan dibuat ulang bila bentrok.
describe("insertOrderWithUniqueCode", () => {
  const db = useTestDatabase();
  const values = (eventId: string) => ({
    eventId,
    customerName: "Budi S.",
    customerPhone: "+6281234567890",
    customerEmail: "budi@example.com",
    paymentMethod: "CASH" as const,
    status: "RESERVED" as const,
    totalAmount: 75_000n,
    expiresAt: new Date("2026-12-20T22:00:00+07:00"),
  });

  it("mencoba kode baru saat kode bentrok dengan order tenant lain", async () => {
    const other = await createEvent(db);
    await createOrder(db, other.id, { orderCode: "UNC-AAAAAA" });
    const event = await createEvent(db);
    codes.queue = ["UNC-AAAAAA", "UNC-BBBBBB"];

    const order = await db.transaction((tx) => insertOrderWithUniqueCode(tx, values(event.id)));
    expect(order.orderCode).toBe("UNC-BBBBBB");
  });

  it("menyerah setelah 5 kali bentrok", async () => {
    const event = await createEvent(db);
    await createOrder(db, event.id, { orderCode: "UNC-CCCCCC" });
    codes.queue = Array.from({ length: 5 }, () => "UNC-CCCCCC");

    await expect(
      db.transaction((tx) => insertOrderWithUniqueCode(tx, values(event.id))),
    ).rejects.toThrow(/kode pesanan unik/);
  });

  it("error selain bentrok kode diteruskan", async () => {
    codes.queue = ["UNC-DDDDDD"];
    await expect(
      db.transaction((tx) =>
        insertOrderWithUniqueCode(tx, {
          ...values(crypto.randomUUID()),
        } as typeof orders.$inferInsert),
      ),
    ).rejects.toThrow();
  });
});

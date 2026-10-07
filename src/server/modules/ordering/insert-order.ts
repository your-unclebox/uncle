import "server-only";

import type { DatabaseTransaction } from "@/server/db/client";
import { isUniqueViolation } from "@/server/db/pg-error";
import { orders } from "@/server/db/schema";

import { generateOrderCode } from "./order-code";

const MAX_CODE_ATTEMPTS = 5;

type NewOrder = Omit<typeof orders.$inferInsert, "orderCode">;

/**
 * Insert order dengan kode pesanan unik global. Tiap percobaan memakai
 * SAVEPOINT supaya bentrok kode (milik tenant mana pun, yang tidak terlihat
 * karena RLS) tidak membatalkan transaksi luar.
 */
export async function insertOrderWithUniqueCode(
  tx: DatabaseTransaction,
  values: NewOrder,
): Promise<typeof orders.$inferSelect> {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      const [order] = await tx.transaction((savepoint) =>
        savepoint
          .insert(orders)
          .values({ ...values, orderCode: generateOrderCode() })
          .returning(),
      );
      if (order) return order;
    } catch (error) {
      if (!isUniqueViolation(error, "orders_order_code_unique")) throw error;
    }
  }
  throw new Error("Gagal membuat kode pesanan unik setelah beberapa percobaan.");
}

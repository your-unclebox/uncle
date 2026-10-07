import type { orderStatus, paymentMethod } from "@/server/db/schema";

import { InvalidOrderTransitionError } from "./errors";

export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];

// DRD §Database 4.1 — satu-satunya definisi transisi status order (AI-CODING-RULES I-8).
const TRANSITIONS: Readonly<
  Record<PaymentMethod, Readonly<Record<OrderStatus, readonly OrderStatus[]>>>
> = {
  QRIS: {
    PENDING_PAYMENT: ["PAID", "EXPIRED"],
    // Webhook PAID terlambat: hanya bila kuota bisa dialokasi ulang (BR-PAY-08).
    EXPIRED: ["PAID"],
    PAID: ["CANCELLED", "REFUNDED"],
    RESERVED: [],
    CANCELLED: [],
    REFUNDED: [],
  },
  CASH: {
    RESERVED: ["PAID", "EXPIRED", "CANCELLED"],
    // Reservasi kedaluwarsa tidak kembali hidup; reissue membuat order BARU (D7).
    EXPIRED: [],
    PAID: ["CANCELLED", "REFUNDED"],
    PENDING_PAYMENT: [],
    CANCELLED: [],
    REFUNDED: [],
  },
};

// Status yang sedang memegang kuota (ticket_types.allocated_count).
export const QUOTA_HOLDING_STATUSES: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "RESERVED",
  "PAID",
];

// Status aktif yang punya batas waktu (expires_at) dan bisa kedaluwarsa.
export const EXPIRABLE_STATUSES = [
  "PENDING_PAYMENT",
  "RESERVED",
] as const satisfies readonly OrderStatus[];

export function initialOrderStatus(
  method: PaymentMethod,
  options: { reissue?: boolean } = {},
): OrderStatus {
  if (options.reissue) {
    if (method !== "CASH") throw new InvalidOrderTransitionError("(baru)", "PAID");
    return "PAID";
  }
  return method === "QRIS" ? "PENDING_PAYMENT" : "RESERVED";
}

export function canTransition(method: PaymentMethod, from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[method][from].includes(to);
}

export function assertTransition(method: PaymentMethod, from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(method, from, to)) throw new InvalidOrderTransitionError(from, to);
}

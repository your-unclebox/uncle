// Bentuk JSON Admin API (DRD API §5) di sisi klien: uang = number, waktu = ISO string.

export interface AdminSummary {
  readonly sold: number;
  readonly paid: number;
  readonly unpaid: number;
  readonly pickedUp: number;
}

export type OrderStatus =
  "PENDING_PAYMENT" | "RESERVED" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";
export type TicketStatus = "ISSUED" | "CHECKED_IN" | "VOID";
export type PaymentMethod = "QRIS" | "CASH";

export interface OrderItemLabel {
  readonly name: string;
  readonly quantity: number;
}

export interface AdminOrderRow {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly paymentMethod: PaymentMethod;
  readonly status: OrderStatus;
  readonly ticketStatus: TicketStatus | null;
  readonly items: readonly OrderItemLabel[];
  readonly totalAmount: number;
  readonly expiresAt: string | null;
  readonly needsReview: boolean;
  readonly createdAt: string;
}

export interface AdminOrderList {
  readonly orders: AdminOrderRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminOrderDetail {
  readonly id: string;
  readonly code: string;
  readonly status: OrderStatus;
  readonly paymentMethod: PaymentMethod;
  readonly customer: { name: string; phone: string; email: string };
  readonly items: ReadonlyArray<OrderItemLabel & { unitPrice: number }>;
  readonly totalAmount: number;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly paidAt: string | null;
  readonly cashConfirmedBy: string | null;
  readonly needsReview: boolean;
  readonly ticket: {
    id: string;
    status: TicketStatus;
    checkedInAt: string | null;
    checkedInBy: string | null;
  } | null;
  readonly emailStatus: string | null;
  readonly reissuedFrom: { id: string; code: string } | null;
  readonly reissuedTo: { id: string; code: string } | null;
  readonly history: ReadonlyArray<{ at: string; label: string }>;
}

export type ScanResultCode =
  | "READY_PICKUP"
  | "CASH_UNPAID"
  | "ALREADY_CHECKED_IN"
  | "RESERVATION_EXPIRED"
  | "CANCELLED"
  | "QRIS_NOT_PAID"
  | "OTHER_EVENT"
  | "INVALID";

export interface ScanView {
  readonly result: ScanResultCode;
  readonly reason?: "PAYMENT_QR" | "UNKNOWN_QR" | "ORDER_CODE_NOT_FOUND";
  readonly ticket?: {
    id: string;
    status: TicketStatus;
    checkedInAt: string | null;
    checkedInBy: string | null;
  };
  readonly order?: {
    id: string;
    code: string;
    customerName: string;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    totalAmount: number;
    expiresAt: string | null;
    paidAt: string | null;
    paidVia: string | null;
    cashConfirmedBy: string | null;
    reissuedFromOrderCode: string | null;
    items: readonly OrderItemLabel[];
  };
  readonly reissue?: {
    available: boolean;
    totalAmount: number;
    items: ReadonlyArray<{
      ticketTypeId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      remaining: number;
    }>;
    reissuedOrder: {
      id: string;
      code: string;
      createdAt: string;
      createdBy: string | null;
      ticketStatus: TicketStatus | null;
    } | null;
  };
  readonly actions: { canConfirmCash: boolean; canCheckIn: boolean; canReissue: boolean };
}

export const itemsLabel = (items: readonly OrderItemLabel[]) =>
  items.map((item) => `${item.quantity} ${item.name}`).join(", ");

// Tabel: no HP tersamar sebagian (UI-UX Responsive §4), penuh di Detail.
export const shortPhone = (phone: string) =>
  phone.length > 8 ? `${phone.slice(0, 4)}…${phone.slice(-4)}` : phone;

const WIB = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "20 Des 18:31" (WIB, UI-UX Scan (g)). */
export function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const parts = Object.fromEntries(
    WIB.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`;
}

/** "18:42" (WIB) — jam saja untuk panel Scanner. */
export function formatClock(iso: string | null): string {
  return iso ? (formatStamp(iso).split(" ").at(-1) ?? "") : "";
}

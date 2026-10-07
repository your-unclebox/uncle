// Bentuk JSON respons Scan API (DRD API §5) di browser: Date → ISO, bigint → number.

export type ScanResultCode =
  | "READY_PICKUP"
  | "CASH_UNPAID"
  | "ALREADY_CHECKED_IN"
  | "RESERVATION_EXPIRED"
  | "CANCELLED"
  | "OTHER_EVENT"
  | "INVALID";

export interface ScanJson {
  readonly result: ScanResultCode;
  readonly reason?: "PAYMENT_QR" | "UNKNOWN";
  readonly ticket?: {
    readonly id: string;
    readonly status: "ISSUED" | "CHECKED_IN" | "VOID";
    readonly checkedInAt: string | null;
    readonly checkedInBy: string | null;
  };
  readonly order?: {
    readonly id: string;
    readonly code: string;
    readonly customerName: string;
    readonly paymentMethod: "QRIS" | "CASH";
    readonly status: string;
    readonly totalAmount: number;
    readonly expiresAt: string | null;
    readonly paidAt: string | null;
    readonly paidBy: string | null;
    readonly reissuedFromOrderCode: string | null;
    readonly items: ReadonlyArray<{ readonly name: string; readonly quantity: number }>;
  };
  readonly reissue?: {
    readonly available: boolean;
    readonly totalAmount: number;
    readonly items: ReadonlyArray<{
      readonly ticketTypeId: string;
      readonly name: string;
      readonly quantity: number;
      readonly unitPrice: number;
      readonly remaining: number;
    }>;
    readonly reissuedOrder: {
      readonly id: string;
      readonly code: string;
      readonly createdAt: string;
      readonly createdBy: string | null;
      readonly ticketStatus: "ISSUED" | "CHECKED_IN" | "VOID" | null;
    } | null;
  };
  readonly actions: {
    readonly canConfirmCash: boolean;
    readonly canCheckIn: boolean;
    readonly canReissue: boolean;
  };
}

export interface ReissueJson {
  readonly order: { readonly id: string; readonly code: string };
  readonly ticket: { readonly id: string; readonly status: string };
}

export const itemsText = (items: ReadonlyArray<{ name: string; quantity: number }>) =>
  items.map((item) => `${item.quantity}× ${item.name}`).join(", ");

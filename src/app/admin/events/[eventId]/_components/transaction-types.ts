// Bentuk JSON respons Admin API (DRD API §5) di sisi browser: Date → ISO string,
// bigint → number (src/server/http/json.ts).

export interface SummaryJson {
  readonly sold: number;
  readonly paid: number;
  readonly unpaid: number;
  readonly pickedUp: number;
}

export interface OrderRowJson {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly customerPhoneMasked: string;
  readonly items: ReadonlyArray<{ readonly name: string; readonly quantity: number }>;
  readonly paymentMethod: "QRIS" | "CASH";
  readonly status: string;
  readonly expiresAt: string | null;
  readonly pickup: "DONE" | "PENDING" | null;
  readonly totalAmount: number;
  readonly createdAt: string;
}

export interface OrderListJson {
  readonly data: readonly OrderRowJson[];
  readonly nextCursor: string | null;
  readonly total: number;
}

export interface OrderHistoryJson {
  readonly kind:
    "CREATED" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "CHECKED_IN" | "REISSUED";
  readonly at: string;
  readonly actorName: string | null;
  readonly paidVia?: "GATEWAY_WEBHOOK" | "GATEWAY_RECONCILE" | "CASH_MANUAL";
  readonly note?: string;
}

export interface OrderDetailJson {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly paymentMethod: "QRIS" | "CASH";
  readonly totalAmount: number;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly needsReview: boolean;
  readonly customer: { readonly name: string; readonly phone: string; readonly email: string };
  readonly items: ReadonlyArray<{
    readonly name: string;
    readonly quantity: number;
    readonly unitPrice: number;
  }>;
  readonly pickup: "DONE" | "PENDING" | null;
  readonly reissuedFrom: { readonly id: string; readonly code: string } | null;
  readonly reissuedTo: { readonly id: string; readonly code: string } | null;
  readonly history: readonly OrderHistoryJson[];
}

export interface TransactionFilters {
  readonly status: string;
  readonly pickup: string;
  readonly method: string;
  readonly q: string;
  readonly includeUnfinished: boolean;
}

export const EMPTY_FILTERS: TransactionFilters = {
  status: "",
  pickup: "",
  method: "",
  q: "",
  includeUnfinished: false,
};

export function itemsLabel(items: OrderRowJson["items"]): string {
  return items.map((item) => `${item.quantity} ${item.name}`).join(", ");
}

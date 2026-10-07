import "server-only";

// Interface adapter gateway pembayaran (DRD Integrations §1.1). Modul payments
// hanya bergantung pada interface ini, bukan pada Tripay secara langsung.

export type GatewayMode = "SANDBOX" | "PRODUCTION";
export type GatewayStatus = "UNPAID" | "PAID" | "EXPIRED" | "FAILED" | "REFUND";

export interface GatewayCredentials {
  readonly mode: GatewayMode;
  readonly merchantCode: string;
  readonly apiKey: string;
  readonly privateKey: string;
}

export interface QrisPaymentInput {
  readonly merchantRef: string;
  readonly amount: number;
  readonly customer: { readonly name: string; readonly email: string; readonly phone: string };
  readonly items: ReadonlyArray<{
    readonly sku: string;
    readonly name: string;
    readonly price: number;
    readonly quantity: number;
  }>;
  readonly expiresAt: Date;
  readonly callbackUrl: string;
}

export interface QrisPayment {
  readonly providerReference: string;
  readonly qrString: string;
  readonly qrImageUrl: string | null;
  readonly expiresAt: Date;
  readonly channel: string;
  readonly feeAmount: number | null;
  readonly raw: unknown;
}

export interface GatewayPaymentStatus {
  readonly status: GatewayStatus;
  /** Nominal tagihan (tanpa fee customer), untuk dicocokkan dengan total order. */
  readonly amount: number;
  readonly paidAt: Date | null;
}

export interface GatewayWebhook extends GatewayPaymentStatus {
  readonly providerReference: string;
  readonly merchantRef: string;
}

export type ConnectionResult = { ok: true } | { ok: false; message: string };

export interface PaymentProvider {
  testConnection(credentials: GatewayCredentials): Promise<ConnectionResult>;
  createQrisPayment(credentials: GatewayCredentials, input: QrisPaymentInput): Promise<QrisPayment>;
  getPaymentStatus(
    credentials: GatewayCredentials,
    providerReference: string,
  ): Promise<GatewayPaymentStatus>;
  verifyWebhook(credentials: GatewayCredentials, rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): GatewayWebhook;
}

/** Gateway gagal: jaringan/timeout ("network") atau ditolak provider ("rejected"). */
export class PaymentGatewayFailure extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "rejected",
  ) {
    super(message);
    this.name = "PaymentGatewayFailure";
  }
}

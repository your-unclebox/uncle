import { DomainError } from "@/server/http/domain-error";

// DRD API §2: gateway gagal membuat QR → 502, kuota sudah dilepas (kompensasi).
export class PaymentGatewayError extends DomainError {
  readonly code = "PAYMENT_GATEWAY_ERROR";
  readonly status = 502;
  constructor() {
    super("Pembayaran QRIS sedang bermasalah. Coba lagi atau pilih Cash.");
  }
}

// Kode baru (belum ada di DRD) — uji ulang koneksi tanpa kredensial tersimpan.
export class PaymentConfigNotSetError extends DomainError {
  readonly code = "PAYMENT_CONFIG_NOT_SET";
  readonly status = 409;
  constructor() {
    super("Kredensial QRIS belum diatur");
  }
}

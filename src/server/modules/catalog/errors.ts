import { DomainError } from "@/server/http/domain-error";

// Kode baru (belum ada di DRD) — dicatat di laporan Fase 3.

export class TicketTypeNotFoundError extends DomainError {
  readonly code = "TICKET_TYPE_NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Jenis tiket tidak ditemukan");
  }
}

export class TicketTypeNameTakenError extends DomainError {
  readonly code = "TICKET_TYPE_NAME_TAKEN";
  readonly status = 409;
  constructor() {
    super("Nama jenis tiket sudah dipakai di event ini");
  }
}

// AC-OWN-07.3
export class QuotaBelowAllocatedError extends DomainError {
  readonly code = "QUOTA_BELOW_ALLOCATED";
  readonly status = 409;
  constructor(readonly allocated: number) {
    super(`Kuota tidak boleh lebih kecil dari tiket terjual (${allocated})`);
  }
}

// BR-EVT-07: jenis tiket yang sudah punya transaksi hanya bisa dinonaktifkan.
export class TicketTypeInUseError extends DomainError {
  readonly code = "TICKET_TYPE_IN_USE";
  readonly status = 409;
  constructor() {
    super("Jenis tiket sudah punya transaksi. Nonaktifkan, jangan dihapus.");
  }
}

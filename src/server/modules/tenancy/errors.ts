import { DomainError } from "@/server/http/domain-error";

// Kode baru (belum ada di DRD) — dicatat di laporan Fase 3.

// DRD API §4: PATCH event wajib If-Match: {version} (optimistic locking).
export class VersionConflictError extends DomainError {
  readonly code = "VERSION_CONFLICT";
  readonly status = 409;
  constructor(readonly currentVersion: number) {
    super("Data sudah diubah di tempat lain. Muat ulang lalu simpan lagi.");
  }
}

// AC-OWN-08.2
export class SlugTakenError extends DomainError {
  readonly code = "SLUG_TAKEN";
  readonly status = 409;
  constructor() {
    super("Subdomain sudah digunakan");
  }
}

// BR-EVT-06
export class SlugLockedError extends DomainError {
  readonly code = "SLUG_LOCKED";
  readonly status = 409;
  constructor() {
    super("Slug tidak bisa diubah karena event sudah punya transaksi.");
  }
}

export interface ChecklistItem {
  readonly key: "name" | "schedule" | "venue" | "ticketTypes" | "slug";
  readonly label: string;
  readonly done: boolean;
}

// AC-OWN-09.2: publish ditolak, tunjukkan item yang belum lengkap.
export class PublishChecklistIncompleteError extends DomainError {
  readonly code = "PUBLISH_CHECKLIST_INCOMPLETE";
  readonly status = 409;
  constructor(readonly items: readonly ChecklistItem[]) {
    super("Data event belum lengkap untuk dipublish");
  }
}

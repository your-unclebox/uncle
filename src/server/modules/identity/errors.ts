import { DomainError } from "@/server/http/domain-error";

// Kode baru (belum ada di DRD) ditandai di laporan Fase 3.

export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";
  readonly status = 401;
  constructor() {
    super("Silakan login terlebih dahulu");
  }
}

// AC-OWN-01.2: pesan umum, tidak membocorkan field mana yang salah.
export class InvalidCredentialsError extends DomainError {
  readonly code = "INVALID_CREDENTIALS";
  readonly status = 401;
  constructor() {
    super("Email atau password salah");
  }
}

// AC-OWN-01.3: Admin membuka area Owner → akses ditolak.
export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor() {
    super("Akses ditolak");
  }
}

export class RateLimitedError extends DomainError {
  readonly code = "RATE_LIMITED";
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number) {
    super("Terlalu banyak percobaan, coba lagi nanti");
  }
}

export class InvitationInvalidError extends DomainError {
  readonly code = "INVITATION_INVALID";
  readonly status = 404;
  constructor() {
    super("Undangan tidak ditemukan");
  }
}

// AC-ADM-01.2
export class InvitationExpiredError extends DomainError {
  readonly code = "INVITATION_EXPIRED";
  readonly status = 410;
  constructor() {
    super("Undangan kedaluwarsa, hubungi Owner");
  }
}

// AC-OWN-10.3: email sudah diundang ke event yang sama → tawarkan kirim ulang.
export class InvitationExistsError extends DomainError {
  readonly code = "INVITATION_EXISTS";
  readonly status = 409;
  constructor(readonly invitationId: string) {
    super("Email sudah diundang");
  }
}

export class AlreadyMemberError extends DomainError {
  readonly code = "ALREADY_MEMBER";
  readonly status = 409;
  constructor() {
    super("Email ini sudah menjadi admin event");
  }
}

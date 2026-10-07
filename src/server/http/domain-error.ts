// Dasar semua error domain; diubah ke RFC 9457 Problem Details di wrapper
// route handler (AI-CODING-RULES §7).
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

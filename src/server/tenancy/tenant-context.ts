import { z } from "zod";

import { DomainError } from "@/server/http/domain-error";

// Konteks tenant aktif (AI-CODING-RULES I-1). eventId berasal dari Host header
// (publik) atau path /admin/events/{eventId} (admin) — tidak pernah dari body.
export interface TenantContext {
  readonly eventId: string;
  readonly actorUserId?: string;
}

// Error internal (bug pemanggil), bukan untuk klien: tidak ada query tenant
// tanpa eventId yang valid.
export class MissingTenantContextError extends DomainError {
  readonly code = "TENANT_CONTEXT_MISSING";
  readonly status = 500;

  constructor() {
    super("Query data tenant membutuhkan TenantContext dengan eventId yang valid.");
  }
}

const eventIdSchema = z.uuid();

export function assertTenantContext(
  context: TenantContext | null | undefined,
): asserts context is TenantContext {
  if (!context || !eventIdSchema.safeParse(context.eventId).success) {
    throw new MissingTenantContextError();
  }
}

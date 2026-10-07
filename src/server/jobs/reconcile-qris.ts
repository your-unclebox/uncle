import "server-only";

import { getPaymentProvider } from "@/integrations/payment-gateway";
import type { Database } from "@/server/db/client";
import { getActivePaymentKek, reconcileQrisPayments } from "@/server/modules/payments";
import { getQrSigningKey } from "@/server/modules/ticketing";

/** Job `reconcile-qris` (DRD Architecture §6, tiap 5 menit). */
export function runReconcileQris(db: Database) {
  return reconcileQrisPayments(db, {
    provider: getPaymentProvider(),
    kek: getActivePaymentKek(),
    qrSigningKey: getQrSigningKey(),
  });
}

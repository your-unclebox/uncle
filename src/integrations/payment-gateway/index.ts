import "server-only";

import { getServerEnv } from "@/config/env";

import type { PaymentProvider } from "./payment-provider";
import { createTripayProvider } from "./tripay/tripay-provider";

export * from "./payment-provider";
export {
  createTripayProvider,
  tripayCallbackSignature,
  tripayRequestSignature,
} from "./tripay/tripay-provider";

let provider: PaymentProvider | undefined;

/** Provider Tripay sesuai environment (TRIPAY_API_BASE_URL hanya untuk mock lokal/E2E). */
export function getPaymentProvider(): PaymentProvider {
  const baseUrl = getServerEnv().TRIPAY_API_BASE_URL;
  provider ??= createTripayProvider(baseUrl ? { baseUrl } : {});
  return provider;
}

import "server-only";

import { getServerEnv } from "@/config/env";
import { getPaymentProvider } from "@/integrations/payment-gateway";
import { getDb } from "@/server/db/client";
import {
  findPaymentConfig,
  getActivePaymentKek,
  processPaymentWebhook,
  retestPaymentConfig,
  savePaymentConfig,
  toPaymentConfigView,
  type PaymentConfigDeps,
} from "@/server/modules/payments";
import { getQrSigningKey } from "@/server/modules/ticketing";
import { withTenant } from "@/server/tenancy";

import { getAppUrl } from "./app-url";
import { readJson } from "./request";
import { authenticateEventAdmin } from "./route";

// Payment Settings admin (DRD API §5) & webhook gateway (DRD API §6).

function configDeps(): PaymentConfigDeps {
  return {
    provider: getPaymentProvider(),
    kek: getActivePaymentKek(),
    mode: getServerEnv().PAYMENT_MODE,
    appUrl: getAppUrl(),
  };
}

export async function getPaymentConfig(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  const config = await withTenant(getDb(), tenant, findPaymentConfig);
  return toPaymentConfigView(config, getAppUrl());
}

export async function putPaymentConfig(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return savePaymentConfig(getDb(), tenant, await readJson(request), configDeps());
}

export async function testPaymentConfig(request: Request, eventId: string) {
  const { tenant } = await authenticateEventAdmin(request, eventId);
  return retestPaymentConfig(getDb(), tenant, configDeps());
}

export async function receiveTripayWebhook(request: Request, webhookKey: string) {
  // Raw body dibaca sebelum JSON parse (DRD Integrations §1.4 langkah 1).
  const rawBody = await request.text();
  return processPaymentWebhook(
    getDb(),
    { webhookKey, rawBody, headers: request.headers },
    {
      provider: getPaymentProvider(),
      kek: getActivePaymentKek(),
      qrSigningKey: getQrSigningKey(),
    },
  );
}

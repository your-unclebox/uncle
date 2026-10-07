import "server-only";

import { getServerEnv } from "@/config/env";

/** Origin dashboard (DRD Architecture §2: app.uncle.id) untuk URL webhook. */
export function getAppUrl(): string {
  const env = getServerEnv();
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const base = env.APP_BASE_DOMAIN;
  return base.includes("localhost") ? `http://${base}` : `https://app.${base}`;
}

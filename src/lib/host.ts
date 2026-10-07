// Pembagian host (DRD Architecture §2 & §4). Murni, tanpa I/O: dipakai
// proxy.ts dan route handler publik (tenant publik selalu dari Host header).

// Subdomain cadangan (DRD Architecture §2) — sama dengan seed tabel reserved_slugs.
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "app",
  "api",
  "www",
  "admin",
  "owner",
  "mail",
  "email",
  "staging",
  "dev",
  "status",
  "cdn",
  "assets",
  "static",
  "help",
  "docs",
  "blog",
]);

// Sama dengan CHECK ck_events_slug_format (BR-EVT-02).
const SLUG_FORMAT = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export type HostKind =
  | { readonly kind: "app" }
  | { readonly kind: "site"; readonly slug: string }
  | { readonly kind: "unknown" };

const stripPort = (host: string): string => host.trim().toLowerCase().replace(/:\d+$/, "");

/**
 * - apex, `www.` dan `app.` dari base domain → dashboard/marketing ("app");
 * - `{slug}.{base}` dengan slug valid & bukan cadangan → landing ("site");
 * - subdomain cadangan / format salah / bertingkat → "unknown" (404);
 * - host lain (localhost, preview deployment) → "app".
 */
export function resolveHost(hostHeader: string | null | undefined, baseDomain: string): HostKind {
  const host = stripPort(hostHeader ?? "");
  const base = stripPort(baseDomain);
  if (!host || host === base || host === `www.${base}` || host === `app.${base}`) {
    return { kind: "app" };
  }
  if (!host.endsWith(`.${base}`)) return { kind: "app" };
  const label = host.slice(0, -(base.length + 1));
  if (label.includes(".") || RESERVED_SUBDOMAINS.has(label) || !SLUG_FORMAT.test(label)) {
    return { kind: "unknown" };
  }
  return { kind: "site", slug: label };
}

/** URL publik landing page, mis. `https://teaterbagol.uncle.id`. */
export function siteOrigin(slug: string, baseDomain: string, protocol: "http" | "https"): string {
  return `${protocol}://${slug}.${baseDomain}`;
}

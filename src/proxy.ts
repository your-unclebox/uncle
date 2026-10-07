import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/config/env";
import { resolveHost } from "@/lib/host";

// Subdomain routing (DRD Architecture §4). Next.js 16: konvensi `middleware`
// diganti `proxy` (node_modules/next/dist/docs/.../file-conventions/proxy.md).
//
// - {slug}.{base}: hanya landing (`/`), halaman pesanan, dan `/api/public/*`.
// - host dashboard: `/sites/*` dan `/api/public/*` → 404, supaya landing hanya
//   bisa diakses lewat subdomain dan tenant publik selalu dari Host.

const ORDER_PAGE = /^\/pesanan\/([A-Za-z0-9-]{1,32})$/;

// Path yang tidak ada → halaman not-found aplikasi dengan status 404.
const notFound = (request: NextRequest) =>
  NextResponse.rewrite(new URL("/__tidak-ditemukan", request.url));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = resolveHost(request.headers.get("host"), getServerEnv().APP_BASE_DOMAIN);

  if (host.kind === "unknown") return notFound(request);

  if (host.kind === "app") {
    if (pathname.startsWith("/sites") || pathname.startsWith("/api/public")) {
      return notFound(request);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/public/")) return NextResponse.next();
  if (pathname === "/") {
    return NextResponse.rewrite(new URL(`/sites/${host.slug}`, request.url));
  }
  const orderPage = ORDER_PAGE.exec(pathname);
  if (orderPage) {
    return NextResponse.rewrite(
      new URL(`/sites/${host.slug}/pesanan/${orderPage[1]}${request.nextUrl.search}`, request.url),
    );
  }
  return notFound(request);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};

import type { Metadata } from "next";

import { OwnerShell } from "./_components/app-shell";

export const metadata: Metadata = { title: "Owner Dashboard · Uncle" };

// Shell statis; sesi dibaca di dalam <Suspense> tiap halaman (Cache Components).
export default function OwnerLayout({ children }: LayoutProps<"/owner">) {
  return <OwnerShell>{children}</OwnerShell>;
}

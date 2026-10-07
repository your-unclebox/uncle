import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "./logout-button";

// UI-UX AppShell Owner: sidebar (desktop) + topbar. Menu Client & Report
// (OWN-12/13, Should) belum dibangun sehingga belum ditampilkan.
export function OwnerShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:px-8">
        <Link href="/owner" className="font-semibold">
          <span className="text-primary">UNCLE</span> — Owner Dashboard
        </Link>
        <LogoutButton />
      </header>
      <div className="flex flex-1">
        <nav
          aria-label="Menu Owner"
          className="hidden w-60 shrink-0 border-r border-border bg-surface p-4 lg:block"
        >
          <Link
            href="/owner"
            className="block rounded-lg bg-primary-subtle px-3 py-2 font-medium text-primary"
          >
            ▣ Event
          </Link>
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

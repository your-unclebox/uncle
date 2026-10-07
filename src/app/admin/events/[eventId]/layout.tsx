import type { Metadata } from "next";
import { Suspense } from "react";

import { LogoutButton } from "@/app/owner/_components/logout-button";

import { AdminNav } from "./_components/admin-nav";

export const metadata: Metadata = { title: "Admin Dashboard · Uncle" };

// Shell Admin event: topbar + menu (sidebar desktop, baris geser di HP).
export default function AdminEventLayout({ children }: LayoutProps<"/admin/events/[eventId]">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:px-8">
        <p className="font-semibold">
          <span className="text-primary">UNCLE</span> — Admin Dashboard
        </p>
        <LogoutButton />
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="border-b border-border bg-surface p-2 lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0 lg:p-4">
          <Suspense fallback={null}>
            <AdminNav />
          </Suspense>
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

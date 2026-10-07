import type { Metadata } from "next";
import { Suspense } from "react";

import { LogoutButton } from "@/app/owner/_components/logout-button";

import { AdminBottomNav, AdminSidebarNav } from "./_components/admin-nav";

export const metadata: Metadata = { title: "Admin Dashboard · Uncle" };

// Shell Admin event: topbar + sidebar (desktop) / bottom nav (HP) — UI-UX §3.
export default function AdminEventLayout({ children }: LayoutProps<"/admin/events/[eventId]">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:h-16 md:px-8">
        <p className="font-semibold">
          <span className="text-primary">UNCLE</span>
          <span className="hidden sm:inline"> — Admin Dashboard</span>
        </p>
        <LogoutButton />
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="hidden border-r border-border bg-surface p-4 lg:block lg:w-60 lg:shrink-0">
          <Suspense fallback={null}>
            <AdminSidebarNav />
          </Suspense>
        </div>
        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 lg:pb-8">{children}</main>
      </div>
      <Suspense fallback={null}>
        <AdminBottomNav />
      </Suspense>
    </div>
  );
}

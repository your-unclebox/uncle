"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Menu Admin (UI-UX Responsive §4): sidebar desktop; bottom nav HP dengan
// Scan di tengah & menonjol. Halaman Scan punya header sendiri → tanpa bottom nav.
function useItems() {
  const { eventId } = useParams<{ eventId: string }>();
  const base = `/admin/events/${eventId}`;
  return [
    { href: base, label: "Transaksi", icon: "▣" },
    { href: `${base}/scan`, label: "Scan Tiket", icon: "📷", primary: true },
    { href: `${base}/payment-settings`, label: "Payment Settings", icon: "⚙" },
  ];
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu Admin" className="flex flex-col gap-1">
      {useItems().map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-2 font-medium whitespace-nowrap",
            pathname === item.href ? "bg-primary-subtle text-primary" : "text-ink hover:bg-muted",
          )}
        >
          <span aria-hidden>{item.icon}</span> {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminBottomNav() {
  const pathname = usePathname();
  const items = useItems();
  if (pathname.endsWith("/scan")) return null;
  return (
    <nav
      aria-label="Menu Admin"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 items-end border-t border-border bg-surface px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs font-medium",
            pathname === item.href ? "text-primary" : "text-subtle",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex items-center justify-center",
              item.primary
                ? "-mt-6 size-14 rounded-full bg-primary text-2xl text-on-primary shadow-lg"
                : "size-8 text-lg",
            )}
          >
            {item.icon}
          </span>
          {item.primary ? "Scan" : item.label === "Payment Settings" ? "Pengaturan" : item.label}
        </Link>
      ))}
    </nav>
  );
}

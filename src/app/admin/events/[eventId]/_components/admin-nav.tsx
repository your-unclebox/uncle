"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Menu Admin (UI-UX Responsive §4). Scan Tiket menyusul (Fase 7).
export function AdminNav() {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const items = [
    { href: `/admin/events/${eventId}`, label: "▣ Ringkasan" },
    { href: `/admin/events/${eventId}/payment-settings`, label: "⚙ Payment Settings" },
  ];
  return (
    <nav aria-label="Menu Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-2 font-medium whitespace-nowrap",
            pathname === item.href ? "bg-primary-subtle text-primary" : "text-ink hover:bg-muted",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

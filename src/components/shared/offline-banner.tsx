"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** navigator.onLine sebagai state React (server: dianggap online). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

// OfflineBanner (UI-UX Components §3): banner merah sticky saat koneksi putus.
export function OfflineBanner({ message }: { message: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-20 border-b border-danger-border bg-danger-bg px-4 py-2 text-sm font-medium text-danger"
    >
      ⚠ {message}
    </div>
  );
}

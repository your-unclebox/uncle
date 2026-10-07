"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

// ShareBar (LP-12): WhatsApp deep link & Salin Link.
export function ShareBar({ eventName }: { eventName: string }) {
  const toast = useToast();

  function shareUrl() {
    return window.location.origin;
  }

  function shareWhatsApp() {
    const text = `Yuk nonton ${eventName}! Pesan tiket di ${shareUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast("Link disalin");
    } catch {
      // Clipboard tidak didukung → tampilkan link untuk disalin manual.
      toast(shareUrl());
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:px-6 lg:px-8">
      <p className="text-sm text-subtle">Ajak teman nonton:</p>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button variant="secondary" size="sm" onClick={shareWhatsApp}>
          WhatsApp
        </Button>
        <Button variant="secondary" size="sm" onClick={copyLink}>
          Salin Link
        </Button>
      </div>
    </div>
  );
}

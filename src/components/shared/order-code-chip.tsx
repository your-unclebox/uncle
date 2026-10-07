"use client";

import { useToast } from "@/components/ui/toast";

// UI-UX OrderCodeChip: kode pesanan monospace + tombol salin.
export function OrderCodeChip({ code }: { code: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast("Kode pesanan disalin");
    } catch {
      toast(`Kode pesanan: ${code}`);
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-lg font-semibold tabular-nums" data-testid="order-code">
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        className="rounded px-2 py-1 text-sm text-primary underline-offset-2 hover:underline"
      >
        Salin
      </button>
    </span>
  );
}

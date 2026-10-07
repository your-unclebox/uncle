"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function CopyAddressButton({ address }: { address: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      toast("Alamat disalin");
    } catch {
      toast(address);
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      Salin Alamat
    </Button>
  );
}

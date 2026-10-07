"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";

// Modal Cek Pesanan (LP-11): kode pesanan + no HP → halaman pesanan.
export function CheckOrderDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orderCode, setOrderCode] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!orderCode.trim() || !phone.trim()) {
      setError("Isi kode pesanan dan no HP.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const found = await apiFetch<{ orderCode: string; accessToken: string }>(
        "/api/public/orders/lookup",
        { method: "POST", body: { orderCode, phone } },
      );
      setOpen(false);
      router.push(`/pesanan/${found.orderCode}?t=${encodeURIComponent(found.accessToken)}`);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.problem.code : null;
      // Tanpa menyebut field mana yang salah (AC-LP-11.2).
      if (code === "ORDER_NOT_FOUND") setError("Pesanan tidak ditemukan.");
      else if (code === "RATE_LIMITED") setError("Terlalu banyak percobaan. Coba lagi nanti.");
      else setError("Gagal memeriksa pesanan, coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Cek Pesanan
        </Button>
      </DialogTrigger>
      <DialogContent title="Cek Pesanan">
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormField id="lookup-code" label="Kode Pesanan">
            <Input
              id="lookup-code"
              value={orderCode}
              placeholder="UNC-______"
              autoCapitalize="characters"
              className="font-mono uppercase"
              onChange={(event) => setOrderCode(event.target.value)}
            />
          </FormField>
          <FormField id="lookup-phone" label="No. HP">
            <Input
              id="lookup-phone"
              value={phone}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="08__________"
              onChange={(event) => setPhone(event.target.value)}
            />
          </FormField>
          {error ? <Alert tone="danger">⚠ {error}</Alert> : null}
          <Button type="submit" loading={pending}>
            Cari Pesanan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

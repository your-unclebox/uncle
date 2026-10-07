"use client";

import { useRouter } from "next/navigation";

import { PaymentWaiting } from "./payment-waiting";

// Halaman pesanan / Cek Pesanan untuk QRIS yang masih menunggu bayar
// (UI-UX User Flow §2): QR pembayaran + sisa waktu; lunas → muat ulang tiket.
export function PendingPayment(props: {
  orderCode: string;
  accessToken: string;
  qrString: string;
  expiresAt: string | null;
  totalAmount: number;
}) {
  const router = useRouter();
  return (
    <PaymentWaiting
      {...props}
      onPaid={() => router.refresh()}
      onRetry={() => router.push("/#tiket")}
    />
  );
}

"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";

// LP-10 / AC-LP-10.2–10.3: klaim "sudah dikirim ke email" hanya bila outbox
// berstatus SENT; gagal/bounce → saran simpan QR. Selama masih diproses,
// status dicek ulang beberapa kali (email dikirim tepat setelah pesanan dibuat).

const POLL_MS = 3_000;
const MAX_POLLS = 10;
const IN_PROGRESS = new Set(["PENDING", "SENDING"]);

export function EmailDeliveryNote({
  orderCode,
  accessToken,
  initialStatus,
}: {
  orderCode: string;
  accessToken: string | null;
  initialStatus: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (!accessToken || (status !== null && !IN_PROGRESS.has(status))) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > MAX_POLLS) {
        clearInterval(timer);
        return;
      }
      void apiFetch<{ order: { emailStatus: string | null } }>(`/api/public/orders/${orderCode}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      })
        .then(({ order }) => setStatus(order.emailStatus))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [orderCode, accessToken, status]);

  if (status === "SENT") {
    return (
      <p className="text-sm font-medium text-success" data-testid="email-note">
        ✅ Juga sudah dikirim ke email kamu
      </p>
    );
  }
  if (status === "FAILED" || status === "BOUNCED") {
    return (
      <p className="text-sm text-danger" data-testid="email-note">
        Email tidak terkirim. Simpan QR ini atau catat kode pesanan.
      </p>
    );
  }
  return null;
}

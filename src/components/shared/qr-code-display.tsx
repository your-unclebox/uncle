"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// UI-UX QRCodeDisplay: quiet zone, min 240px, label jelas agar QR Tiket tidak
// tertukar dengan QR pembayaran. Library dimuat saat dibutuhkan (JS awal kecil).
export function QRCodeDisplay({
  value,
  variant,
  caption,
  downloadName,
}: {
  value: string;
  variant: "ticket" | "payment";
  caption?: string;
  downloadName: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const label = variant === "ticket" ? "QR Tiket" : "QR Pembayaran";

  useEffect(() => {
    let active = true;
    void import("qrcode").then(({ toDataURL }) =>
      toDataURL(value, { errorCorrectionLevel: "M", margin: 4, width: 480 }).then((url) => {
        if (active) setDataUrl(url);
      }),
    );
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className="text-sm font-semibold tracking-wide text-subtle uppercase">
        {label}
      </figcaption>
      <div
        className={cn(
          "flex aspect-square w-[70vw] max-w-[280px] min-w-[240px] items-center justify-center rounded-2xl border border-border bg-white",
          !dataUrl && "animate-pulse bg-muted",
        )}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL hasil render lokal
          <img src={dataUrl} alt={label} className="size-full rounded-2xl" data-qr-value={value} />
        ) : null}
      </div>
      {caption ? <p className="text-center text-sm text-subtle">{caption}</p> : null}
      {dataUrl ? (
        <Button variant="secondary" size="sm" asChild>
          <a href={dataUrl} download={`${downloadName}.png`}>
            Simpan {label}
          </a>
        </Button>
      ) : null}
    </figure>
  );
}

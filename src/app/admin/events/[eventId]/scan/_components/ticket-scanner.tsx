"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import type QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ScanResultPanel } from "./scan-result-panel";
import { itemsText, type ReissueJson, type ScanJson } from "./scan-types";

// Halaman Scan Tiket (SCN-01..08, UI-UX Wireframe §4, User Flow §6):
// kamera → "Memeriksa tiket…" → panel hasil → aksi → "Scan Berikutnya".
// QR di-decode di perangkat (qr-scanner); server memvalidasi (DRD §5.3).

type Mode = "scanning" | "processing" | "result" | "success";
type Camera = "starting" | "active" | "unavailable";

const SUCCESS_RESET_MS = 3_000;
const RED_RESULTS = new Set(["INVALID", "OTHER_EVENT", "CANCELLED", "ALREADY_CHECKED_IN"]);

function vibrate(pattern: number | number[]) {
  // Getaran opsional; browser tanpa dukungan cukup diabaikan.
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

const problemTitle = (error: unknown) =>
  error instanceof ApiError ? error.problem.title : "Terjadi kesalahan. Coba lagi.";

export function TicketScanner({
  eventId,
  eventName,
  timezone,
}: {
  eventId: string;
  eventName: string;
  timezone: string;
}) {
  const toast = useToast();
  const base = `/api/admin/events/${eventId}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const modeRef = useRef<Mode>("scanning");

  const [mode, setModeState] = useState<Mode>("scanning");
  const [camera, setCamera] = useState<Camera>("starting");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [hasFlash, setHasFlash] = useState(false);
  const [view, setView] = useState<ScanJson | null>(null);
  const [reissuedFrom, setReissuedFrom] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<ScanJson | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [progress, setProgress] = useState<{ pickedUp: number; sold: number } | null>(null);
  const [reissueKey, setReissueKey] = useState(() => crypto.randomUUID());

  const setMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  // Progres "diambil/terjual" di header; dimuat ulang setelah check-in.
  const [progressKey, setProgressKey] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const summary = await apiFetch<{ pickedUp: number; sold: number }>(`${base}/summary`);
        if (active) setProgress(summary);
      } catch {
        // Progres hanya informasi di header; scan tetap berjalan.
        if (active) setProgress(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [base, progressKey]);

  // (j) Offline: scan dijeda.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const submit = useCallback(
    async (input: { payload: string } | { orderCode: string }) => {
      setMode("processing");
      scannerRef.current?.pause();
      vibrate(40);
      try {
        const result = await apiFetch<ScanJson>(`${base}/scan`, { method: "POST", body: input });
        if (RED_RESULTS.has(result.result)) vibrate([200, 100, 200]);
        setView(result);
        setReissuedFrom(null);
        setReissueKey(crypto.randomUUID());
        setMode("result");
      } catch (error) {
        toast(
          error instanceof ApiError && error.problem.code === "NETWORK_ERROR"
            ? "Tidak ada koneksi, coba lagi"
            : problemTitle(error),
          "danger",
        );
        setMode("scanning");
        void scannerRef.current?.start();
      }
    },
    [base, setMode, toast],
  );

  // Kamera: dimuat dinamis (hanya di browser), kamera belakang.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let instance: QrScanner | null = null;
    void (async () => {
      try {
        const { default: Scanner } = await import("qr-scanner");
        if (disposed) return;
        instance = new Scanner(
          video,
          (decoded) => {
            if (modeRef.current !== "scanning" || !decoded.data) return;
            void submit({ payload: decoded.data });
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            maxScansPerSecond: 5,
            returnDetailedScanResult: true,
          },
        );
        scannerRef.current = instance;
        await instance.start();
        if (disposed) return;
        setCamera("active");
        setHasFlash(await instance.hasFlash());
      } catch {
        if (!disposed) setCamera("unavailable");
      }
    })();
    return () => {
      disposed = true;
      instance?.destroy();
      scannerRef.current = null;
    };
  }, [submit, cameraAttempt]);

  const next = useCallback(() => {
    setView(null);
    setCheckedIn(null);
    setReissuedFrom(null);
    setMode("scanning");
    void scannerRef.current?.start();
  }, [setMode]);

  // (f) Sukses diambil: kembali otomatis ke (a) setelah 3 detik.
  useEffect(() => {
    if (mode !== "success") return;
    const timer = setTimeout(next, SUCCESS_RESET_MS);
    return () => clearTimeout(timer);
  }, [mode, next]);

  async function confirmCash(orderId: string) {
    setBusy(true);
    try {
      const result = await apiFetch<ScanJson>(`${base}/orders/${orderId}/confirm-cash`, {
        method: "POST",
        body: { cashReceived: true },
      });
      setView(result);
      toast("Lunas dikonfirmasi");
    } catch (error) {
      toast(problemTitle(error), "danger");
      if (view?.order) await submit({ orderCode: view.order.code });
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(ticketId: string) {
    setBusy(true);
    try {
      const result = await apiFetch<ScanJson>(`${base}/tickets/${ticketId}/check-in`, {
        method: "POST",
      });
      setCheckedIn(result);
      vibrate(80);
      setMode("success");
      setProgressKey((key) => key + 1);
    } catch (error) {
      // Didahului admin lain → tampilkan SUDAH DIAMBIL terbaru.
      toast(problemTitle(error), "danger");
      if (view?.order) await submit({ orderCode: view.order.code });
    } finally {
      setBusy(false);
    }
  }

  async function reissue(orderId: string, expectedTotal: number) {
    const oldCode = view?.order?.code ?? null;
    setBusy(true);
    try {
      const created = await apiFetch<ReissueJson>(`${base}/orders/${orderId}/reissue`, {
        method: "POST",
        body: { cashReceived: true, expectedTotal },
        headers: { "idempotency-key": reissueKey },
      });
      const result = await apiFetch<ScanJson>(`${base}/scan`, {
        method: "POST",
        body: { orderCode: created.order.code },
      });
      setView(result);
      setReissuedFrom(oldCode);
      toast("Pesanan baru dibuat — Lunas");
    } catch (error) {
      const code = error instanceof ApiError ? error.problem.code : "";
      toast(code === "QUOTA_INSUFFICIENT" ? "Kuota keburu habis" : problemTitle(error), "danger");
      // Muat ulang panel: (k2) kuota habis, (k3) sudah dibuat, atau tagihan terbaru.
      if (oldCode) await submit({ orderCode: oldCode });
    } finally {
      setBusy(false);
    }
  }

  function toggleFlash() {
    void scannerRef.current?.toggleFlash();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/events/${eventId}`}
              aria-label="Kembali ke Transaksi"
              className="text-xl"
            >
              ←
            </Link>
            <h1 className="text-xl font-bold">Scan Tiket</h1>
          </div>
          <p className="truncate text-sm text-subtle" data-testid="scan-progress">
            {eventName}
            {progress
              ? ` · ${formatNumber(progress.pickedUp)}/${formatNumber(progress.sold)} diambil`
              : ""}
          </p>
        </div>
        {hasFlash ? (
          <Button variant="secondary" size="sm" onClick={toggleFlash} aria-label="Senter">
            🔦
          </Button>
        ) : null}
      </header>

      {!online ? (
        <Alert tone="danger">⚠ Tidak ada koneksi internet. Scan dijeda. Coba lagi.</Alert>
      ) : null}

      {mode === "success" && checkedIn ? <SuccessScreen view={checkedIn} onNext={next} /> : null}

      <div className={cn("flex flex-col gap-4", mode === "success" && "hidden")}>
        <div
          className={cn(
            "relative overflow-hidden rounded-xl bg-ink",
            mode === "scanning" ? "h-[55vh]" : "h-0",
            camera === "unavailable" && "hidden",
          )}
        >
          <video ref={videoRef} className="size-full object-cover" muted playsInline />
          <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">
            {camera === "starting" ? "Menyalakan kamera…" : "Arahkan ke QR tiket"}
          </p>
        </div>

        {camera === "unavailable" && mode === "scanning" ? (
          <CameraUnavailable
            onRetry={() => {
              setCamera("starting");
              setCameraAttempt((n) => n + 1);
            }}
          />
        ) : null}

        {mode === "processing" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <p className="font-medium">◌ Memeriksa tiket…</p>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : null}

        {mode === "result" && view ? (
          <ScanResultPanel
            key={`${view.result}-${view.order?.id ?? ""}-${view.order?.status ?? ""}`}
            view={view}
            timezone={timezone}
            reissuedFromCode={reissuedFrom}
            actions={{
              busy,
              onConfirmCash: confirmCash,
              onCheckIn: checkIn,
              onReissue: reissue,
              onOpenOrder: (orderCode) => void submit({ orderCode }),
              onNext: next,
            }}
          />
        ) : null}

        {mode === "scanning" ? (
          <Button variant="secondary" size="lg" onClick={() => setManualOpen(true)}>
            ⌨ Input Kode Manual
          </Button>
        ) : null}
      </div>

      <ManualCodeSheet
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSubmit={(orderCode) => {
          setManualOpen(false);
          void submit({ orderCode });
        }}
      />
    </div>
  );
}

function SuccessScreen({ view, onNext }: { view: ScanJson; onNext: () => void }) {
  return (
    <section
      aria-live="assertive"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl bg-success p-6 text-center text-white"
    >
      <span aria-hidden className="text-7xl">
        ✔
      </span>
      <h2 className="text-2xl font-bold">Tiket diambil!</h2>
      {view.order ? (
        <p className="text-lg">
          {view.order.customerName} · {itemsText(view.order.items)}
        </p>
      ) : null}
      <Button size="lg" variant="secondary" className="w-full" onClick={onNext}>
        Scan Berikutnya
      </Button>
    </section>
  );
}

// (h) Izin kamera ditolak / tidak ada kamera; desktop: arahkan ke HP.
function CameraUnavailable({ onRetry }: { onRetry: () => void }) {
  const [pageQr, setPageQr] = useState<string | null>(null);
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    let active = true;
    void (async () => {
      const { toDataURL } = await import("qrcode");
      const url = await toDataURL(window.location.href, { margin: 2, width: 240 });
      if (active) setPageQr(url);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 text-center">
      {pageQr ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL lokal */}
          <img src={pageQr} alt="QR link halaman Scan Tiket" width={160} height={160} />
          <p className="font-medium">Buka halaman ini dari HP untuk memindai tiket</p>
        </>
      ) : (
        <>
          <span aria-hidden className="text-4xl">
            📷✕
          </span>
          <p className="font-medium">
            Kamera tidak bisa diakses. Izinkan kamera di pengaturan browser, lalu muat ulang.
          </p>
        </>
      )}
      <Button variant="secondary" onClick={onRetry}>
        Coba Lagi
      </Button>
    </div>
  );
}

// (i) Input kode manual (bottom sheet), huruf besar otomatis.
function ManualCodeSheet({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (orderCode: string) => void;
}) {
  const [code, setCode] = useState("");
  function handle(event: FormEvent) {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;
    setCode("");
    onSubmit(value);
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface p-6 shadow-lg md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
          <DialogPrimitive.Title className="text-lg font-semibold">
            Kode Pesanan
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Ketik kode pesanan bila QR tidak bisa dipindai.
          </DialogPrimitive.Description>
          <form onSubmit={handle} className="mt-4 flex flex-col gap-3">
            <Input
              aria-label="Kode pesanan"
              placeholder="UNC-______"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={32}
              autoFocus
            />
            <Button type="submit" size="lg" disabled={!code.trim()}>
              Cari
            </Button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

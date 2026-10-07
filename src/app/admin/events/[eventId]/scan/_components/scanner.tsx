"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { OfflineBanner } from "@/components/shared/offline-banner";
import { QRCodeDisplay } from "@/components/shared/qr-code-display";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";

import type { AdminSummary, ScanView } from "../../_components/admin-types";
import { CameraView } from "./camera-view";
import { ScanResultPanel } from "./scan-result-panel";

// Halaman Scan Tiket (SCN-01 … SCN-08, UI-UX §4): satu hasil dalam satu waktu —
// kamera dijeda sampai admin memilih aksi atau "Scan Berikutnya".

type ScanInput = { payload: string } | { orderCode: string };

type Phase =
  | { kind: "ready" }
  | { kind: "processing"; slow: boolean }
  | { kind: "result"; view: ScanView; input: ScanInput; reissued: boolean; key: number }
  | { kind: "offline"; input: ScanInput }
  | { kind: "success"; name: string; summary: string };

const SUCCESS_RETURN_MS = 3000;
const SLOW_AFTER_MS = 5000;

function subscribeMedia(callback: () => void) {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Scan kamera hanya untuk HP (UI-UX Responsive §5); desktop → Input Kode Manual. */
function useTouchDevice(): boolean | null {
  return useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => null,
  );
}

const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern);
const isNetworkError = (error: unknown) =>
  error instanceof ApiError && error.problem.code === "NETWORK_ERROR";

export function Scanner(props: { eventId: string; eventName: string; summary: AdminSummary }) {
  return (
    <ToastProvider>
      <ScannerContent {...props} />
    </ToastProvider>
  );
}

function ScannerContent({
  eventId,
  eventName,
  summary: initialSummary,
}: {
  eventId: string;
  eventName: string;
  summary: AdminSummary;
}) {
  const api = `/api/admin/events/${eventId}`;
  const toast = useToast();
  const touch = useTouchDevice();
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [summary, setSummary] = useState(initialSummary);
  const [manualOpen, setManualOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"confirm" | "checkIn" | "reissue" | null>(null);
  const resultKey = useRef(0);
  const reissueKey = useRef<string | null>(null);

  const showResult = useCallback((view: ScanView, input: ScanInput, reissued = false) => {
    resultKey.current += 1;
    reissueKey.current = null;
    setPhase({ kind: "result", view, input, reissued, key: resultKey.current });
    const good = view.result === "READY_PICKUP" || view.result === "CASH_UNPAID";
    vibrate(good || view.actions.canReissue ? 80 : [200, 80, 200]);
  }, []);

  const scan = useCallback(
    async (input: ScanInput) => {
      setPhase({ kind: "processing", slow: false });
      const slowTimer = setTimeout(
        () => setPhase({ kind: "processing", slow: true }),
        SLOW_AFTER_MS,
      );
      try {
        const view = await apiFetch<ScanView>(`${api}/scan`, { method: "POST", body: input });
        showResult(view, input);
      } catch (error) {
        if (isNetworkError(error)) setPhase({ kind: "offline", input });
        else {
          toast(
            error instanceof ApiError ? error.problem.title : "Gagal memeriksa tiket",
            "danger",
          );
          setPhase({ kind: "ready" });
        }
      } finally {
        clearTimeout(slowTimer);
      }
    },
    [api, showResult, toast],
  );

  const refreshSummary = useCallback(() => {
    apiFetch<AdminSummary>(`${api}/summary`)
      .then(setSummary)
      .catch(() => undefined);
  }, [api]);

  // Layar sukses penuh ±3 detik lalu kembali ke kamera (UI-UX Scan (f)).
  useEffect(() => {
    if (phase.kind !== "success") return;
    const timer = setTimeout(() => setPhase({ kind: "ready" }), SUCCESS_RETURN_MS);
    return () => clearTimeout(timer);
  }, [phase.kind]);

  function onDecode(text: string) {
    vibrate(40);
    void scan({ payload: text });
  }

  async function act(kind: "confirm" | "checkIn" | "reissue") {
    if (phase.kind !== "result") return;
    const { view, input } = phase;
    const order = view.order;
    if (!order) return;
    setBusy(kind);
    try {
      if (kind === "confirm") {
        const next = await apiFetch<ScanView>(`${api}/orders/${order.id}/confirm-cash`, {
          method: "POST",
          body: { cashReceived: true },
        });
        showResult(next, input);
        refreshSummary();
      } else if (kind === "checkIn" && view.ticket) {
        await apiFetch(`${api}/tickets/${view.ticket.id}/check-in`, { method: "POST" });
        vibrate(120);
        setPhase({
          kind: "success",
          name: order.customerName,
          summary: order.items.map((item) => `${item.quantity}× ${item.name}`).join(", "),
        });
        refreshSummary();
      } else if (kind === "reissue" && view.reissue) {
        // Satu Idempotency-Key per panel: tap ganda / retry jaringan tidak membuat 2 pesanan.
        reissueKey.current ??= crypto.randomUUID();
        const created = await apiFetch<{ view: ScanView }>(`${api}/orders/${order.id}/reissue`, {
          method: "POST",
          body: { cashReceived: true, expectedTotal: view.reissue.totalAmount },
          headers: { "idempotency-key": reissueKey.current },
        });
        showResult(created.view, { orderCode: created.view.order?.code ?? order.code }, true);
        toast("QR Tiket baru dikirim ke email pembeli");
        refreshSummary();
      }
    } catch (error) {
      await handleActionError(kind, error, input);
    } finally {
      setBusy(null);
    }
  }

  async function handleActionError(kind: string, error: unknown, input: ScanInput) {
    if (isNetworkError(error)) {
      toast(
        kind === "reissue" ? "Gagal membuat pesanan, coba lagi" : "Tidak ada koneksi, coba lagi",
        "danger",
      );
      return;
    }
    const code = error instanceof ApiError ? error.problem.code : "";
    // Status berubah di server (admin lain / kuota direbut / harga) → tampilkan kondisi terbaru.
    const messages: Record<string, string> = {
      QUOTA_INSUFFICIENT: "Kuota keburu habis",
      PRICE_CHANGED: "Harga berubah, cek ulang tagihan",
      ALREADY_REISSUED: "Sudah dibuatkan pesanan baru oleh admin lain",
      ALREADY_CHECKED_IN: "Tiket sudah diambil",
      ORDER_NOT_RESERVED: "Status pesanan sudah berubah",
      RESERVATION_EXPIRED: "Reservasi sudah kedaluwarsa",
    };
    toast(
      messages[code] ??
        (kind === "confirm" ? "Gagal konfirmasi, coba lagi" : "Gagal menyimpan, coba lagi"),
      "danger",
    );
    if (messages[code]) await scan(input);
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    setManualOpen(false);
    setCode("");
    void scan({ orderCode: value });
  }

  const cameraPaused = phase.kind !== "ready" || manualOpen;
  const panelRef = useRef<HTMLDivElement>(null);
  const resultId = phase.kind === "result" ? phase.key : null;

  // Panel hasil selalu terlihat (tombol aksi di area jempol, UI-UX Responsive §5).
  useEffect(() => {
    if (resultId !== null)
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [resultId]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <OfflineBanner message="Tidak ada koneksi internet. Scan dijeda. Coba lagi." />
      <header className="flex items-center gap-3">
        <Link
          href={`/admin/events/${eventId}`}
          aria-label="Kembali ke Transaksi"
          className="flex size-10 items-center justify-center rounded-lg text-xl hover:bg-muted"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Scan Tiket</h1>
          <p className="truncate text-sm text-subtle" data-testid="scan-progress">
            {eventName} · {formatNumber(summary.pickedUp)}/{formatNumber(summary.sold)}
          </p>
        </div>
      </header>

      {phase.kind === "success" ? (
        <div
          role="status"
          data-testid="scan-success"
          className="flex flex-col items-center gap-3 rounded-xl bg-success px-6 py-12 text-center text-white"
        >
          <span aria-hidden className="text-6xl">
            ✔
          </span>
          <p className="text-2xl font-bold">Tiket diambil!</p>
          <p className="text-lg">
            {phase.name} · {phase.summary}
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setPhase({ kind: "ready" })}
          >
            Scan Berikutnya
          </Button>
        </div>
      ) : (
        <>
          {touch === null ? (
            <Skeleton className="h-[55svh]" />
          ) : touch ? (
            <CameraView
              paused={cameraPaused}
              compact={phase.kind !== "ready"}
              onDecode={onDecode}
              onManual={() => setManualOpen(true)}
            />
          ) : (
            <DesktopNotice />
          )}

          {phase.kind === "processing" ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
              <p className="font-medium">
                ◌ {phase.slow ? "Masih memeriksa… koneksi lambat" : "Memeriksa tiket…"}
              </p>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ) : phase.kind === "offline" ? (
            <Alert tone="danger">
              <div className="flex flex-col gap-3">
                <p className="font-semibold">⚠ Tidak ada koneksi, coba lagi</p>
                <p className="text-sm">Status belum tersimpan sampai server mengonfirmasi.</p>
                <Button onClick={() => void scan(phase.input)}>Coba Lagi</Button>
                <Button variant="secondary" onClick={() => setPhase({ kind: "ready" })}>
                  Scan Berikutnya
                </Button>
              </div>
            </Alert>
          ) : phase.kind === "result" ? (
            <div ref={panelRef}>
              <ScanResultPanel
                key={phase.key}
                view={phase.view}
                reissued={phase.reissued}
                actions={{
                  busy,
                  onConfirmCash: () => void act("confirm"),
                  onCheckIn: () => void act("checkIn"),
                  onReissue: () => void act("reissue"),
                  onOpenOrder: (orderCode) => void scan({ orderCode }),
                  onNext: () => setPhase({ kind: "ready" }),
                }}
              />
            </div>
          ) : null}

          {phase.kind === "ready" ? (
            <Button variant="secondary" size="lg" onClick={() => setManualOpen(true)}>
              ⌨ Input Kode Manual
            </Button>
          ) : null}
        </>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent title="Kode Pesanan">
          <form onSubmit={submitManual} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg text-subtle">UNC-</span>
              <Input
                aria-label="Kode Pesanan"
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                className="font-mono uppercase"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/^UNC-/, ""))}
              />
            </div>
            <Button type="submit" size="lg" disabled={!code.trim()}>
              Cari
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DesktopNotice() {
  const [url] = useState(() => (typeof window === "undefined" ? "" : window.location.href));
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 text-center">
      <p className="font-semibold">📱 Buka dari HP untuk scan dengan kamera</p>
      <p className="text-sm text-subtle">
        Scan kamera hanya tersedia di HP. Pindai QR ini dengan HP admin, atau pakai Input Kode
        Manual.
      </p>
      {url ? <QRCodeDisplay value={url} variant="link" downloadName="link-scan-tiket" /> : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// ScannerCameraView (UI-UX Components §3, Responsive §5): kamera belakang,
// deteksi QR di perangkat, jeda saat memproses, senter bila didukung.

export type CameraState = "starting" | "scanning" | "denied" | "unsupported";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const SCAN_INTERVAL_MS = 200;
const MAX_DECODE_WIDTH = 640;

async function createDecoder(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  // Fallback iOS Safari dkk.: jsQR di canvas kecil (ringan untuk HP low-end).
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || video.videoWidth === 0) return null;
    const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null
    );
  };
}

export function CameraView({
  paused,
  compact,
  onDecode,
  onManual,
}: {
  paused: boolean;
  /** Ada panel hasil: kamera diperkecil agar panel & tombol aksi di area jempol. */
  compact: boolean;
  onDecode: (text: string) => void;
  onManual: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pausedRef = useRef(paused);
  const onDecodeRef = useRef(onDecode);
  const [state, setState] = useState<CameraState>("starting");
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stream: MediaStream | null = null;
    let wakeLock: { release: () => Promise<void> } | null = null;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setState("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        if (!cancelled) setState("denied");
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const [track] = stream.getVideoTracks();
      trackRef.current = track ?? null;
      const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorch({ supported: Boolean(capabilities?.torch), on: false });
      setState("scanning");
      // Layar tetap menyala selama Scanner aktif (bila didukung).
      const wake = (
        navigator as { wakeLock?: { request: (t: "screen") => Promise<typeof wakeLock> } }
      ).wakeLock;
      wakeLock = (await wake?.request("screen").catch(() => null)) ?? null;

      const decode = await createDecoder();
      let busy = false;
      timer = setInterval(() => {
        if (busy || pausedRef.current || cancelled) return;
        busy = true;
        decode(video)
          .then((text) => {
            if (text && !pausedRef.current && !cancelled) onDecodeRef.current(text);
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, SCAN_INTERVAL_MS);
    };
    void start();

    return () => {
      cancelled = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
      void wakeLock?.release().catch(() => undefined);
    };
  }, [attempt]);

  async function toggleTorch() {
    const next = !torch.on;
    await trackRef.current
      ?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorch({ supported: true, on: next }))
      .catch(() => undefined);
  }

  if (state === "denied" || state === "unsupported") {
    if (compact) return null;
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-muted px-6 py-10 text-center">
        <span aria-hidden className="text-4xl">
          📷✕
        </span>
        {state === "denied" ? (
          <p>
            Kamera tidak bisa diakses.
            <br />
            Izinkan kamera di pengaturan browser, lalu muat ulang.
          </p>
        ) : (
          <p>Gunakan Chrome atau Safari terbaru (HTTPS) untuk scan kamera.</p>
        )}
        <div className="flex w-full flex-col gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setState("starting");
              setAttempt((value) => value + 1);
            }}
          >
            Coba Lagi
          </Button>
          <Button onClick={onManual}>⌨ Input Kode Manual</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-ink transition-[height]"
      style={{ height: compact ? "28svh" : "55svh" }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Kamera scan QR Tiket"
        className="h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="size-56 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
      </div>
      <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white">
        {state === "starting"
          ? "Membuka kamera…"
          : paused
            ? "Kamera dijeda"
            : "Arahkan ke QR tiket"}
      </p>
      {torch.supported ? (
        <button
          type="button"
          onClick={() => void toggleTorch()}
          aria-pressed={torch.on}
          aria-label="Senter"
          className="absolute top-3 right-3 flex size-12 items-center justify-center rounded-full bg-black/50 text-xl text-white"
        >
          🔦
        </button>
      ) : null}
    </div>
  );
}

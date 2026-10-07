"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Toast sederhana (UI-UX Components §4): satu pesan singkat, hilang sendiri.
type ToastTone = "default" | "danger";

interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string, tone: ToastTone = "default") => {
    clearTimeout(timer.current);
    setMessage({ id: Date.now(), text, tone });
    timer.current = setTimeout(() => setMessage(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex justify-center md:bottom-8"
      >
        {message ? (
          <p
            key={message.id}
            role={message.tone === "danger" ? "alert" : "status"}
            className={cn(
              "rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
              message.tone === "danger" ? "bg-danger text-white" : "bg-ink text-white",
            )}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

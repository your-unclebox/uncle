"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";

import { useMutation } from "./use-mutation";

type Availability =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; message: string };

const REASONS: Record<string, string> = {
  TAKEN: "Subdomain sudah digunakan",
  INVALID_FORMAT: 'Hanya huruf kecil, angka, dan "-" (3–30 karakter)',
  RESERVED: "Subdomain ini dicadangkan sistem",
};

// OWN-08 (UI-UX Tab Subdomain): cek ketersediaan live (debounce) + simpan.
export function SubdomainTab({
  eventId,
  currentSlug,
  baseDomain,
}: {
  eventId: string;
  currentSlug: string | null;
  baseDomain: string;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(currentSlug ?? "");
  const [availability, setAvailability] = useState<Availability>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useMutation();
  const locked = save.errorCode === "SLUG_LOCKED";

  function onSlugChange(raw: string) {
    const value = raw.trim().toLowerCase();
    setSlug(value);
    clearTimeout(timer.current);
    if (!value || value === currentSlug) {
      setAvailability({ kind: "idle" });
      return;
    }
    setAvailability({ kind: "checking" });
    timer.current = setTimeout(() => {
      apiFetch<{ available: boolean; reason?: string }>(
        `/api/owner/slugs/${encodeURIComponent(value)}/availability`,
      )
        .then((result) =>
          setAvailability(
            result.available
              ? { kind: "available" }
              : { kind: "unavailable", message: REASONS[result.reason ?? ""] ?? "Tidak tersedia" },
          ),
        )
        .catch(() => setAvailability({ kind: "idle" }));
    }, 300);
  }

  async function onSave() {
    const result = await save.run(
      () => apiFetch(`/api/owner/events/${eventId}/slug`, { method: "PUT", body: { slug } }),
      "Subdomain tersimpan",
    );
    if (result) router.refresh();
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <label htmlFor="slug" className="text-sm font-medium">
        Slug
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="slug"
          value={slug}
          disabled={locked}
          onChange={(e) => onSlugChange(e.target.value)}
          invalid={availability.kind === "unavailable"}
        />
        <span className="whitespace-nowrap text-subtle">.{baseDomain}</span>
      </div>
      <p aria-live="polite" className="text-sm">
        {availability.kind === "checking" ? (
          <span className="text-subtle">◌ Memeriksa ketersediaan…</span>
        ) : null}
        {availability.kind === "available" ? (
          <span className="text-success">
            ✔ Tersedia — {slug}.{baseDomain}
          </span>
        ) : null}
        {availability.kind === "unavailable" ? (
          <span className="text-danger">✘ {availability.message}</span>
        ) : null}
      </p>
      {locked ? (
        <Alert tone="neutral">🔒 Slug tidak bisa diubah karena event sudah punya transaksi.</Alert>
      ) : null}
      {save.error && !locked ? <Alert tone="danger">{save.error}</Alert> : null}
      {save.success ? <Alert tone="success">{save.success}</Alert> : null}
      <Button
        className="self-start"
        loading={save.pending}
        disabled={locked || !slug || slug === currentSlug || availability.kind === "unavailable"}
        onClick={onSave}
      >
        Simpan Subdomain
      </Button>
    </div>
  );
}

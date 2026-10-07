"use client";

import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ApiError, apiFetch, fieldErrors } from "@/lib/api-client";
import type { PaymentConfigView } from "@/server/modules/payments/payment-config";

// UI-UX §3.3 Payment Settings — state (a) Belum diatur, (b) Menguji,
// (c) Terhubung, (d) Gagal. Kredensial tidak pernah dikirim balik ke browser.

type Field = "merchantCode" | "apiKey" | "privateKey";
const FIELDS: ReadonlyArray<{ key: Field; label: string }> = [
  { key: "merchantCode", label: "Merchant Code" },
  { key: "apiKey", label: "API Key" },
  { key: "privateKey", label: "Private Key" },
];
const EMPTY = { merchantCode: "", apiKey: "", privateKey: "" };
const MASK = "●●●●●●●●●●";

const testedAt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : null;

function ConnectionStatus({ view }: { view: PaymentConfigView }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-subtle">Status Koneksi</span>
      <span className="flex flex-col items-end gap-1" data-testid="connection-status">
        {view.status === "CONNECTED" ? (
          <Badge tone="success">✅ Terhubung</Badge>
        ) : view.status === "FAILED" ? (
          <Badge tone="danger">✘ Gagal terhubung</Badge>
        ) : (
          <Badge tone="neutral">○ Belum diatur</Badge>
        )}
        {view.status === "CONNECTED" && view.lastTestedAt ? (
          <span className="text-xs text-subtle">Diuji {testedAt(view.lastTestedAt)}</span>
        ) : null}
      </span>
    </div>
  );
}

function SecretInput({
  id,
  value,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        value={value}
        invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="secondary"
        aria-label={visible ? "Sembunyikan" : "Tampilkan"}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "🙈" : "👁"}
      </Button>
    </div>
  );
}

function SettingsForm({ eventId, initial }: { eventId: string; initial: PaymentConfigView }) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState(initial.status === "NOT_SET");
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applied(next: PaymentConfigView) {
    setView(next);
    setEditing(false);
    setForm(EMPTY);
    if (next.status === "CONNECTED") toast("QRIS aktif di landing page");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    // AC-ADM-07.3: tombol tetap aktif; field kosong ditandai saat Simpan.
    const missing = Object.fromEntries(
      FIELDS.filter(({ key }) => !form[key].trim()).map(({ key }) => [key, "Wajib diisi"]),
    );
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    setPending("save");
    setError(null);
    try {
      applied(
        await apiFetch<PaymentConfigView>(`/api/admin/events/${eventId}/payment-config`, {
          method: "PUT",
          body: { provider: "TRIPAY", ...form },
        }),
      );
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(caught instanceof ApiError ? caught.problem.title : "Gagal menyimpan, coba lagi.");
    } finally {
      setPending(null);
    }
  }

  async function retest() {
    setPending("test");
    setError(null);
    try {
      applied(
        await apiFetch<PaymentConfigView>(`/api/admin/events/${eventId}/payment-config/test`, {
          method: "POST",
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.problem.title : "Gagal menguji, coba lagi.");
    } finally {
      setPending(null);
    }
  }

  async function copyWebhook() {
    if (!view.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(view.webhookUrl);
      toast("URL callback disalin");
    } catch {
      toast(view.webhookUrl);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Konfigurasi QRIS</h2>
        {view.mode ? (
          <Badge tone="info">Mode: {view.mode === "SANDBOX" ? "Sandbox" : "Production"}</Badge>
        ) : null}
      </div>
      <ConnectionStatus view={view} />

      {view.status === "FAILED" && !editing ? (
        <>
          <Alert tone="danger">
            Provider menolak kredensial: &quot;{view.lastError ?? "Tidak diketahui"}&quot;. Periksa
            kembali.
          </Alert>
          <p className="text-sm text-subtle">
            ⓘ Opsi QRIS tidak tampil di landing page sampai koneksi berhasil.
          </p>
        </>
      ) : null}

      {editing ? (
        <form noValidate onSubmit={save} className="flex flex-col gap-4">
          <p className="rounded-lg bg-info-bg p-3 text-sm text-ink">
            ⓘ Pembayaran QRIS masuk langsung ke rekening akun QRIS kamu. Uncle tidak menyimpan dana.
          </p>
          <FormField id="provider" label="Provider">
            <select
              id="provider"
              disabled
              className="h-12 rounded-lg border border-border bg-muted px-4 text-base"
            >
              <option>Tripay</option>
            </select>
          </FormField>
          {FIELDS.map(({ key, label }) => (
            <FormField key={key} id={`payment-${key}`} label={label} required error={errors[key]}>
              <SecretInput
                id={`payment-${key}`}
                value={form[key]}
                invalid={Boolean(errors[key])}
                onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
              />
            </FormField>
          ))}
          <a
            href="https://tripay.co.id/developer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            ⓘ Cara mendapatkan Merchant Code, API Key &amp; Private Key Tripay ↗
          </a>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" loading={pending === "save"}>
            {pending === "save" ? "Menguji koneksi…" : "Simpan & Uji Koneksi"}
          </Button>
          {view.status !== "NOT_SET" ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Batal
            </Button>
          ) : null}
        </form>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-subtle">Merchant Code</dt>
            <dd className="font-mono">
              {MASK}
              {view.merchantCodeLast4}
            </dd>
            <dt className="text-subtle">API Key</dt>
            <dd className="font-mono">
              {MASK}
              {view.apiKeyLast4}
            </dd>
            <dt className="text-subtle">Private Key</dt>
            <dd className="font-mono">{MASK}●●●●</dd>
          </dl>
          {view.webhookUrl ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-subtle">URL Callback (dikirim otomatis ke Tripay)</span>
              <span className="flex items-center gap-2">
                <code className="truncate rounded bg-muted px-2 py-1">{view.webhookUrl}</code>
                <Button type="button" size="sm" variant="ghost" onClick={copyWebhook}>
                  Salin
                </Button>
              </span>
            </div>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
                setErrors({});
                setError(null);
              }}
            >
              Ganti Kredensial
            </Button>
            <Button variant="secondary" loading={pending === "test"} onClick={retest}>
              {pending === "test" ? "Menguji koneksi…" : "Uji Ulang"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function PaymentSettingsForm(props: { eventId: string; initial: PaymentConfigView }) {
  return (
    <ToastProvider>
      <SettingsForm {...props} />
    </ToastProvider>
  );
}

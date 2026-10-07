"use client";

import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { contrastRatio, isHexColor } from "@/lib/color";

import type { DetailsForm } from "./info-tab";

const MIN_CONTRAST = 4.5;

// OWN-06 (warna). Upload logo menunggu integrasi Supabase Storage.
export function BrandingTab({
  form,
  errors,
  onChange,
}: {
  form: DetailsForm;
  errors: Record<string, string>;
  onChange: (field: keyof DetailsForm, value: string) => void;
}) {
  const primaryValid = isHexColor(form.primaryColor);
  const lowContrast = primaryValid && contrastRatio("#FFFFFF", form.primaryColor) < MIN_CONTRAST;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Alert tone="info">
          Upload logo menyusul setelah penyimpanan file (Supabase Storage) aktif.
        </Alert>
        {(["primaryColor", "secondaryColor"] as const).map((field) => (
          <FormField
            key={field}
            id={field}
            label={field === "primaryColor" ? "Warna Primary" : "Warna Secondary"}
            error={errors[field]}
            helper="Format #RRGGBB"
          >
            <div className="flex gap-3">
              <input
                aria-label={`Pilih ${field === "primaryColor" ? "warna primary" : "warna secondary"}`}
                type="color"
                value={isHexColor(form[field]) ? form[field] : "#2563EB"}
                onChange={(e) => onChange(field, e.target.value.toUpperCase())}
                className="h-12 w-14 rounded-lg border border-border"
              />
              <Input
                id={field}
                value={form[field]}
                placeholder="#2563EB"
                invalid={Boolean(errors[field])}
                onChange={(e) => onChange(field, e.target.value)}
              />
            </div>
          </FormField>
        ))}
        {lowContrast ? (
          <Alert tone="pending">
            ⚠ Kontras teks putih di atas Primary{" "}
            {contrastRatio("#FFFFFF", form.primaryColor).toFixed(1)}:1 (min 4.5:1). Tombol di
            landing page akan memakai teks gelap.
          </Alert>
        ) : null}
      </div>
      <div aria-label="Preview" className="rounded-xl border border-border bg-page p-4">
        <p className="text-xs font-semibold text-subtle">PREVIEW (mobile)</p>
        <div className="mx-auto mt-3 max-w-[360px] overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex h-12 items-center justify-between border-b border-border px-3 text-sm">
            <span className="font-semibold">[Logo]</span>
            <span className="text-subtle">Cek Pesanan</span>
          </div>
          <div className="h-24 bg-muted" />
          <div className="flex flex-col gap-3 p-4">
            <p className="font-semibold">{form.name || "Nama event"}</p>
            <div
              className="flex h-12 items-center justify-center rounded-lg font-medium"
              style={{
                background: primaryValid ? form.primaryColor : "#2563EB",
                color: lowContrast ? "#111827" : "#FFFFFF",
              }}
            >
              Pilih Tiket
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

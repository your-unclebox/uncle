"use client";

import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";

export interface DetailsForm {
  name: string;
  description: string;
  category: string;
  eventType: string;
  date: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  mapsUrl: string;
  primaryColor: string;
  secondaryColor: string;
  contactInfo: string;
  terms: string;
  refundPolicy: string;
}

// BR-EVT-09: Jam Selesai otomatis Jam Mulai + 3 jam selama belum diubah manual.
export function addThreeHours(time: string): string {
  const [h = "0", m = "0"] = time.split(":");
  const hours = Math.min(Number(h) + 3, 23);
  const minutes = Number(h) + 3 > 23 ? 59 : Number(m);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function InfoTab({
  form,
  errors,
  onChange,
  onStartTimeChange,
}: {
  form: DetailsForm;
  errors: Record<string, string>;
  onChange: (field: keyof DetailsForm, value: string) => void;
  onStartTimeChange: (value: string) => void;
}) {
  const text = (field: keyof DetailsForm) => ({
    id: field,
    value: form[field],
    invalid: Boolean(errors[field]),
    onChange: (e: { target: { value: string } }) => onChange(field, e.target.value),
  });

  return (
    <div className="flex flex-col gap-6">
      <FormField id="name" label="Nama Event" required error={errors.name}>
        <Input {...text("name")} />
      </FormField>
      <FormField id="description" label="Deskripsi" error={errors.description}>
        <Textarea {...text("description")} rows={6} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="date" label="Tanggal" required error={errors.date}>
          <Input {...text("date")} type="date" />
        </FormField>
        <FormField id="startTime" label="Jam Mulai (WIB)" required error={errors.startTime}>
          <Input
            id="startTime"
            type="time"
            value={form.startTime}
            invalid={Boolean(errors.startTime)}
            onChange={(e) => onStartTimeChange(e.target.value)}
          />
        </FormField>
        <FormField
          id="endTime"
          label="Jam Selesai (WIB)"
          required
          error={errors.endTime}
          helper="Otomatis Jam Mulai + 3 jam, bisa diubah. Juga jadi batas default reservasi Cash."
        >
          <Input {...text("endTime")} type="time" />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="venueName" label="Nama tempat" required error={errors.venueName}>
          <Input {...text("venueName")} />
        </FormField>
        <FormField id="mapsUrl" label="Link Google Maps" error={errors.mapsUrl}>
          <Input {...text("mapsUrl")} type="url" placeholder="https://maps.google.com/…" />
        </FormField>
      </div>
      <FormField id="venueAddress" label="Alamat lengkap" error={errors.venueAddress}>
        <Textarea {...text("venueAddress")} rows={2} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="category" label="Kategori" error={errors.category}>
          <Input {...text("category")} placeholder="mis. Teater" />
        </FormField>
        <FormField id="eventType" label="Tipe" error={errors.eventType}>
          <Input {...text("eventType")} placeholder="mis. Di lokasi" />
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Konten Pendukung (opsional)</legend>
        <FormField id="contactInfo" label="Kontak Penyelenggara" error={errors.contactInfo}>
          <Textarea {...text("contactInfo")} rows={2} placeholder="WA / email / Instagram" />
        </FormField>
        <FormField id="terms" label="Syarat & Ketentuan" error={errors.terms}>
          <Textarea {...text("terms")} rows={4} />
        </FormField>
        <FormField id="refundPolicy" label="Kebijakan Pengembalian" error={errors.refundPolicy}>
          <Textarea {...text("refundPolicy")} rows={4} />
        </FormField>
      </fieldset>
    </div>
  );
}

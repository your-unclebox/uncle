import { z } from "zod";

// Form Info Umum, Branding & Konten Pendukung (UI-UX Wireframe §2.3).
// Semua opsional kecuali nama, karena Draft boleh belum lengkap (AC-OWN-04.1).
const optionalText = (max: number) => z.string().trim().max(max).optional();
const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Format warna #RRGGBB")
  .optional();

export const eventDetailsInputSchema = z
  .object({
    name: z.string("Wajib diisi").trim().min(1, "Wajib diisi").max(200),
    description: optionalText(10_000),
    category: optionalText(60),
    eventType: optionalText(60),
    date: z
      .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid")])
      .optional(),
    startTime: z
      .union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/, "Jam tidak valid")])
      .optional(),
    endTime: z
      .union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/, "Jam tidak valid")])
      .optional(),
    venueName: optionalText(200),
    venueAddress: optionalText(500),
    mapsUrl: z
      .union([z.literal(""), z.url({ protocol: /^https?$/, error: "URL tidak valid" })])
      .optional(),
    primaryColor: hexColor,
    secondaryColor: hexColor,
    contactInfo: optionalText(1_000),
    terms: optionalText(10_000),
    refundPolicy: optionalText(10_000),
  })
  .strict();

export type EventDetailsInput = z.input<typeof eventDetailsInputSchema>;

export const slugInputSchema = z.object({ slug: z.string().trim().toLowerCase() }).strict();

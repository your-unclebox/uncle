import { z } from "zod";

import { normalizeIndonesianPhone } from "@/lib/phone";

// Schema input — bisa dipakai ulang di form client (tanpa dependensi server).

const REQUIRED = "Wajib diisi";

export const customerSchema = z
  .object({
    // BR-TRX-02
    name: z.string(REQUIRED).trim().min(2, "Nama minimal 2 karakter").max(100),
    phone: z
      .string(REQUIRED)
      .trim()
      .min(1, REQUIRED)
      .transform((value, ctx) => {
        const normalized = normalizeIndonesianPhone(value);
        if (!normalized) {
          ctx.addIssue({ code: "custom", message: "Format no HP tidak valid" });
          return z.NEVER;
        }
        return normalized;
      }),
    // BR-TRX-03: email wajib, hanya untuk kirim QR Tiket.
    email: z
      .string(REQUIRED)
      .trim()
      .min(1, REQUIRED)
      .max(254)
      .pipe(z.email("Format email tidak valid")),
  })
  .strict();

export const orderItemInputSchema = z
  .object({
    ticketTypeId: z.uuid("Jenis tiket tidak valid"),
    quantity: z.number().int().min(0).max(1000),
  })
  .strict();

export const createCashOrderInputSchema = z
  .object({
    items: z
      .array(orderItemInputSchema)
      .min(1, "Pilih minimal 1 tiket")
      .max(20)
      .refine(
        (items) => new Set(items.map((item) => item.ticketTypeId)).size === items.length,
        "Jenis tiket tidak boleh ganda",
      ),
    customer: customerSchema,
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();

export type CreateCashOrderInput = z.input<typeof createCashOrderInputSchema>;

export const reissueExpiredOrderInputSchema = z
  .object({
    orderId: z.uuid(),
    // Admin wajib mencentang "Sudah terima uang" (UI-UX Scan (k1)).
    cashReceived: z.literal(true, "Konfirmasi penerimaan uang wajib"),
    expectedTotal: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ReissueExpiredOrderInput = z.input<typeof reissueExpiredOrderInputSchema>;

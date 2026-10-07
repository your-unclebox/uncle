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

// Body POST /api/public/orders (DRD API §2). Idempotency-Key datang dari header.
export const publicOrderRequestSchema = z
  .object({
    items: createCashOrderInputSchema.shape.items,
    customer: customerSchema,
    paymentMethod: z.enum(["QRIS", "CASH"], "Pilih metode pembayaran"),
    // Cloudflare Turnstile (DRD Security §4) — belum diverifikasi, kredensial belum ada.
    captchaToken: z.string().max(4096).optional(),
  })
  .strict();

export type PublicOrderRequest = z.input<typeof publicOrderRequestSchema>;

// Query GET /api/admin/events/{eventId}/orders (DRD API §5, ADM-04/05).
export const adminOrderListQuerySchema = z
  .object({
    status: z
      .enum(["PENDING_PAYMENT", "RESERVED", "PAID", "EXPIRED", "CANCELLED", "REFUNDED"])
      .optional(),
    pickup: z.enum(["pending", "done"]).optional(),
    method: z.enum(["QRIS", "CASH"]).optional(),
    q: z.string().trim().max(100).optional(),
    // Default: sembunyikan checkout QRIS yang ditinggal & order kedaluwarsa (UI-UX §3.1).
    includeUnfinished: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export type AdminOrderListQuery = z.output<typeof adminOrderListQuerySchema>;

// Body POST …/orders/{orderId}/confirm-cash (BR-PAY-04, SCN-04).
export const confirmCashInputSchema = z
  .object({ cashReceived: z.literal(true, 'Centang "Sudah terima uang" dulu') })
  .strict();

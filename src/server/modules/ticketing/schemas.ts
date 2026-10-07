import { z } from "zod";

// Body POST /api/admin/events/{eventId}/scan (DRD API §5): payload QR dari
// kamera, atau kode pesanan yang diketik manual (SCN-06).
export const scanInputSchema = z
  .object({
    payload: z.string().trim().min(1).max(1024).optional(),
    orderCode: z
      .string()
      .trim()
      .min(1, "Masukkan kode pesanan")
      .max(20)
      .transform((value) => {
        const code = value.toUpperCase().replace(/\s+/g, "");
        return code.startsWith("UNC-") ? code : `UNC-${code}`;
      })
      .optional(),
  })
  .strict()
  .refine((input) => (input.payload === undefined) !== (input.orderCode === undefined), {
    message: "Kirim payload QR atau kode pesanan",
  });

export type ScanInput = z.input<typeof scanInputSchema>;

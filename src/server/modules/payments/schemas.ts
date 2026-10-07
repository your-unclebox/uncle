import { z } from "zod";

const REQUIRED = "Wajib diisi";
const secret = z.string(REQUIRED).trim().min(1, REQUIRED).max(512);

// ADM-07: ketiga kredensial Tripay wajib (AC-ADM-07.3).
export const paymentConfigInputSchema = z
  .object({
    provider: z.literal("TRIPAY").default("TRIPAY"),
    merchantCode: z.string(REQUIRED).trim().min(1, REQUIRED).max(64),
    apiKey: secret,
    privateKey: secret,
  })
  .strict();

export type PaymentConfigInput = z.input<typeof paymentConfigInputSchema>;

import { z } from "zod";

// Satu-satunya tempat membaca process.env (AI-CODING-RULES §6).
// Variabel di luar Fase 1 masih opsional; dijadikan wajib saat modulnya dibangun.
const optionalString = z.string().min(1).optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_DOMAIN: z.string().min(1).default("uncle.localhost:3000"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_URL_DIRECT: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("event-media"),
  PAYMENT_KEK_V1: optionalString,
  PAYMENT_KEK_ACTIVE_ID: z.string().min(1).default("v1"),
  QR_SIGNING_KEY: optionalString,
  CRON_SECRET: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  EMAIL_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  EMAIL_WEBHOOK_SECRET: optionalString,
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
  VERCEL_API_TOKEN: optionalString,
  VERCEL_PROJECT_ID: optionalString,
  VERCEL_TEAM_ID: optionalString,
  SENTRY_DSN: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

// Nilai kosong di .env diperlakukan sebagai "tidak diisi".
type EnvSource = Readonly<Record<string, string | undefined>>;

function withoutEmptyValues(source: EnvSource): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  const result = serverEnvSchema.safeParse(withoutEmptyValues(source));
  if (!result.success) {
    // Hanya nama variabel yang disebut, tidak pernah nilainya.
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Environment variable tidak valid atau belum diisi: ${names}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

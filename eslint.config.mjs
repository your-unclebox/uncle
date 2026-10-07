import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // AI-CODING-RULES Coding Conventions §3 & §8.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-expect-error": "allow-with-description" },
      ],
      "no-console": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  {
    // AI-CODING-RULES §5: route handler & halaman tidak boleh query DB langsung;
    // akses data lewat modul di src/server (TenantScopedRepository).
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "drizzle-orm", message: "Query DB hanya di src/server/**." },
            { name: "postgres", message: "Query DB hanya di src/server/**." },
          ],
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*"],
              message: "Akses DB lewat modul src/server/modules/** atau src/server/tenancy.",
            },
            {
              group: ["@/integrations/*"],
              message: "Integrasi pihak ketiga hanya dipanggil dari src/server/**.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/server/db/migrations/**",
  ]),
]);

export default eslintConfig;

// Klien fetch untuk Client Component → Route Handler (AI-CODING-RULES §4).
export interface Problem {
  readonly code: string;
  readonly title: string;
  readonly status: number;
  readonly errors?: Record<string, string[]>;
  readonly [extension: string]: unknown;
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.title);
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; ifMatch?: number } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.ifMatch !== undefined ? { "if-match": `"${options.ifMatch}"` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", title: "Tidak ada koneksi, coba lagi", status: 0 });
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem =
      data && typeof data === "object" && "code" in data
        ? (data as Problem)
        : { code: "UNKNOWN", title: "Terjadi kesalahan. Coba lagi.", status: response.status };
    throw new ApiError(problem);
  }
  return data as T;
}

// Pesan error per field dari VALIDATION_ERROR (ambil pesan pertama).
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.problem.errors) return {};
  return Object.fromEntries(
    Object.entries(error.problem.errors).map(([key, messages]) => [key, messages[0] ?? ""]),
  );
}

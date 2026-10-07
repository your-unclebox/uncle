export const ORIGIN = "http://app.uncle.test";

export interface CallOptions {
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  ifMatch?: number;
}

export function makeRequest(method: string, path: string, options: CallOptions = {}): Request {
  const headers = new Headers({ "content-type": "application/json", "user-agent": "vitest" });
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin) headers.set("origin", origin);
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.ifMatch !== undefined) headers.set("if-match", `"${options.ifMatch}"`);
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

export const ctx = <P extends Record<string, string>>(params: P) => ({
  params: Promise.resolve(params),
});

// Ambil "nama=nilai" dari Set-Cookie untuk dipakai sebagai header Cookie.
export function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

export async function body<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

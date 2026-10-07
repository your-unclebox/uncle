// Uang & angka bigint dikirim sebagai integer JSON (DRD API §1: Rupiah utuh).
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  return value;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data, replacer), { ...init, headers });
}

export function noContent(init: ResponseInit = {}): Response {
  return new Response(null, { ...init, status: 204 });
}

/** Bentuk JSON yang sama dengan respons API — untuk data awal Server Component → klien. */
export function toJsonValue<T>(data: unknown): T {
  return JSON.parse(JSON.stringify(data, replacer)) as T;
}

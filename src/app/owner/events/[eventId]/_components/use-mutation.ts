"use client";

import { useState } from "react";

import { ApiError, fieldErrors } from "@/lib/api-client";

// Status aksi: tombol dikunci saat request berjalan (cegah klik ganda),
// pesan error umum + per field, pesan sukses singkat.
export function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>, successMessage?: string): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setErrors({});
    setSuccess(null);
    setErrorCode(null);
    try {
      const result = await action();
      if (successMessage) setSuccess(successMessage);
      return result;
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setErrorCode(caught instanceof ApiError ? caught.problem.code : null);
      setError(caught instanceof ApiError ? caught.problem.title : "Terjadi kesalahan. Coba lagi.");
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, errorCode, errors, success, run, setError };
}

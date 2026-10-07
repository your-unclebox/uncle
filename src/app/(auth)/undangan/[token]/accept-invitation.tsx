"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch, fieldErrors } from "@/lib/api-client";

interface InvitationInfo {
  eventName: string;
  email: string;
  name: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; info: InvitationInfo }
  | { kind: "error"; message: string };

export function AcceptInvitation({ tokenPromise }: { tokenPromise: Promise<string> }) {
  const token = use(tokenPromise);
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<InvitationInfo>(`/api/auth/invitations/${encodeURIComponent(token)}`)
      .then((info) => setState({ kind: "ready", info }))
      .catch((error: unknown) =>
        setState({
          kind: "error",
          // AC-ADM-01.2: "Undangan kedaluwarsa, hubungi Owner".
          message: error instanceof ApiError ? error.problem.title : "Gagal memuat undangan",
        }),
      );
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setErrors({});
    setSubmitError(null);
    try {
      const result = await apiFetch<{ eventId: string }>(
        `/api/auth/invitations/${encodeURIComponent(token)}/accept`,
        { method: "POST", body: { name: form.get("name"), password: form.get("password") } },
      );
      router.replace(`/admin/events/${result.eventId}`);
    } catch (error) {
      setErrors(fieldErrors(error));
      setSubmitError(error instanceof ApiError ? error.problem.title : "Gagal mengaktifkan akun");
      setPending(false);
    }
  }

  if (state.kind === "loading") return <Skeleton className="mt-6 h-80" />;
  if (state.kind === "error") {
    return (
      <Card className="mt-6">
        <Alert tone="danger">{state.message}</Alert>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <h1 className="text-xl font-bold">Aktivasi akun admin</h1>
      <p className="mt-1 text-subtle">
        Kamu diundang mengelola <strong className="text-ink">{state.info.eventName}</strong> sebagai{" "}
        {state.info.email}.
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        <FormField id="name" label="Nama" required error={errors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={state.info.name}
            required
            invalid={Boolean(errors.name)}
          />
        </FormField>
        <FormField
          id="password"
          label="Password"
          required
          error={errors.password}
          helper="Minimal 10 karakter"
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            invalid={Boolean(errors.password)}
          />
        </FormField>
        <Button type="submit" loading={pending}>
          {pending ? "Mengaktifkan…" : "Aktifkan akun"}
        </Button>
      </form>
    </Card>
  );
}

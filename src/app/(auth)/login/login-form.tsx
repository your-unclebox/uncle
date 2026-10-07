"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch, fieldErrors } from "@/lib/api-client";

interface Me {
  isOwner: boolean;
  adminEventIds: string[];
}

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setErrors({});
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email: form.get("email"), password: form.get("password") },
      });
      const me = await apiFetch<Me>("/api/auth/me");
      const firstEvent = me.adminEventIds[0];
      router.replace(me.isOwner ? "/owner" : firstEvent ? `/admin/events/${firstEvent}` : "/login");
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(caught instanceof ApiError ? caught.problem.title : "Terjadi kesalahan. Coba lagi.");
      setPending(false);
    }
  }

  return (
    <Card className="mt-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <FormField id="email" label="Email" required error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            invalid={Boolean(errors.email)}
          />
        </FormField>
        <FormField id="password" label="Password" required error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            invalid={Boolean(errors.password)}
          />
        </FormField>
        <Button type="submit" loading={pending}>
          {pending ? "Masuk…" : "Masuk"}
        </Button>
      </form>
    </Card>
  );
}

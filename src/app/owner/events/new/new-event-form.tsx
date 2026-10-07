"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch, fieldErrors } from "@/lib/api-client";

export function NewEventForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    setPending(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>("/api/owner/events", {
        method: "POST",
        body: { name },
      });
      router.push(`/owner/events/${created.id}`);
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(caught instanceof ApiError ? caught.problem.title : "Gagal membuat event");
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <FormField
          id="name"
          label="Nama Event"
          required
          error={errors.name}
          helper="Detail lain bisa dilengkapi setelah event tersimpan sebagai Draft."
        >
          <Input id="name" name="name" required invalid={Boolean(errors.name)} />
        </FormField>
        <Button type="submit" loading={pending}>
          {pending ? "Menyimpan…" : "Simpan Draft"}
        </Button>
      </form>
    </Card>
  );
}

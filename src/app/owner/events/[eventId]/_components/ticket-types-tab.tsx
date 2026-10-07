"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";
import type { EventEditorData } from "@/server/http/owner-pages";

import { useMutation } from "./use-mutation";

type TicketType = EventEditorData["ticketTypes"][number];

const toNumber = (value: FormDataEntryValue | null) =>
  value === null || value === "" ? undefined : Number(value);

// OWN-07: tambah/ubah/nonaktifkan/hapus jenis tiket (UI-UX Tab Jenis Tiket).
export function TicketTypesTab({
  eventId,
  ticketTypes,
}: {
  eventId: string;
  ticketTypes: TicketType[];
}) {
  const router = useRouter();
  const create = useMutation();
  const [editing, setEditing] = useState<string | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const created = await create.run(
      () =>
        apiFetch(`/api/owner/events/${eventId}/ticket-types`, {
          method: "POST",
          body: {
            name: form.get("name"),
            price: toNumber(form.get("price")),
            quota: toNumber(form.get("quota")),
          },
        }),
      "Jenis tiket tersimpan",
    );
    if (created) {
      formElement.reset();
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {ticketTypes.length === 0 ? (
        <EmptyState
          icon="🎟"
          title="Belum ada jenis tiket"
          description="Belum ada jenis tiket. Tambahkan minimal 1 untuk publish."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Harga</th>
                <th className="px-4 py-3 font-medium">Kuota</th>
                <th className="px-4 py-3 font-medium">Terjual</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ticketTypes.map((type) =>
                editing === type.id ? (
                  <EditRow
                    key={type.id}
                    eventId={eventId}
                    type={type}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <ViewRow
                    key={type.id}
                    eventId={eventId}
                    type={type}
                    onEdit={() => setEditing(type.id)}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
        noValidate
      >
        <h3 className="font-semibold">+ Tambah Jenis Tiket</h3>
        {create.error && Object.keys(create.errors).length === 0 ? (
          <Alert tone="danger">{create.error}</Alert>
        ) : null}
        {create.success ? <Alert tone="success">{create.success}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="new-name" label="Nama" required error={create.errors.name}>
            <Input
              id="new-name"
              name="name"
              placeholder="Reguler"
              invalid={Boolean(create.errors.name)}
            />
          </FormField>
          <FormField id="new-price" label="Harga (Rp)" required error={create.errors.price}>
            <Input
              id="new-price"
              name="price"
              type="number"
              min={1}
              inputMode="numeric"
              invalid={Boolean(create.errors.price)}
            />
          </FormField>
          <FormField id="new-quota" label="Kuota" required error={create.errors.quota}>
            <Input
              id="new-quota"
              name="quota"
              type="number"
              min={1}
              inputMode="numeric"
              invalid={Boolean(create.errors.quota)}
            />
          </FormField>
        </div>
        <Button type="submit" loading={create.pending} className="self-start">
          Simpan Jenis Tiket
        </Button>
      </form>
    </div>
  );
}

function ViewRow({
  eventId,
  type,
  onEdit,
}: {
  eventId: string;
  type: TicketType;
  onEdit: () => void;
}) {
  const router = useRouter();
  const action = useMutation();
  const toggle = () =>
    action
      .run(() =>
        apiFetch(`/api/owner/events/${eventId}/ticket-types/${type.id}`, {
          method: "PATCH",
          body: { isActive: !type.isActive },
        }),
      )
      .then((ok) => ok && router.refresh());
  const remove = () =>
    action
      .run(() =>
        apiFetch(`/api/owner/events/${eventId}/ticket-types/${type.id}`, { method: "DELETE" }),
      )
      .then(() => router.refresh());

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 font-medium">{type.name}</td>
      <td className="px-4 py-3 tabular-nums">{formatRupiah(type.price)}</td>
      <td className="px-4 py-3 tabular-nums">{type.quota}</td>
      <td className="px-4 py-3 tabular-nums">{type.allocated}</td>
      <td className="px-4 py-3">
        <Badge tone={type.isActive ? "success" : "neutral"}>
          {type.isActive ? "Aktif" : "Nonaktif"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            ✎ Edit
          </Button>
          <Button size="sm" variant="ghost" loading={action.pending} onClick={toggle}>
            {type.isActive ? "Nonaktifkan" : "Aktifkan"}
          </Button>
          {type.allocated === 0 ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={remove}>
              Hapus
            </Button>
          ) : null}
        </div>
        {action.error ? (
          <p className="mt-2 text-right text-sm text-danger">ⓘ {action.error}</p>
        ) : null}
      </td>
    </tr>
  );
}

function EditRow({
  eventId,
  type,
  onDone,
}: {
  eventId: string;
  type: TicketType;
  onDone: () => void;
}) {
  const router = useRouter();
  const save = useMutation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updated = await save.run(() =>
      apiFetch(`/api/owner/events/${eventId}/ticket-types/${type.id}`, {
        method: "PATCH",
        body: {
          name: form.get("name"),
          price: toNumber(form.get("price")),
          quota: toNumber(form.get("quota")),
        },
      }),
    );
    if (updated) {
      onDone();
      router.refresh();
    }
  }

  const formId = `edit-${type.id}`;
  return (
    <tr className="border-t border-border bg-primary-subtle align-top">
      <td className="px-4 py-3">
        <form id={formId} onSubmit={onSubmit} />
        <Input
          form={formId}
          name="name"
          aria-label="Nama"
          defaultValue={type.name}
          invalid={Boolean(save.errors.name)}
        />
      </td>
      <td className="px-4 py-3">
        <Input
          form={formId}
          name="price"
          aria-label="Harga"
          type="number"
          min={1}
          defaultValue={type.price}
        />
      </td>
      <td className="px-4 py-3">
        <Input
          form={formId}
          name="quota"
          aria-label="Kuota"
          type="number"
          min={1}
          defaultValue={type.quota}
        />
        {save.error ? <p className="mt-2 text-sm text-danger">ⓘ {save.error}</p> : null}
      </td>
      <td className="px-4 py-3 tabular-nums">{type.allocated}</td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <Button size="sm" type="submit" form={formId} loading={save.pending}>
            Simpan
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Batal
          </Button>
        </div>
      </td>
    </tr>
  );
}

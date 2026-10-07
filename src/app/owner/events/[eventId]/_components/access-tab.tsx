"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import type { EventEditorData } from "@/server/http/owner-pages";

import { useMutation } from "./use-mutation";

type AccessRow = EventEditorData["access"][number];

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  ACTIVE: { tone: "success", label: "● Aktif" },
  PENDING: { tone: "info", label: "◌ Diundang" },
  EXPIRED: { tone: "pending", label: "⚠ Kedaluwarsa" },
};

// OWN-10 (UI-UX Tab Akses Admin). Sampai email aktif, link undangan
// ditampilkan sekali untuk disalin Owner.
export function AccessTab({ eventId, rows }: { eventId: string; rows: AccessRow[] }) {
  const router = useRouter();
  const invite = useMutation();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await invite.run(
      () =>
        apiFetch<{ inviteUrl: string }>(`/api/owner/events/${eventId}/invitations`, {
          method: "POST",
          body: { email: form.get("email"), name: form.get("name") },
        }),
      "Undangan terkirim",
    );
    if (result) {
      setInviteUrl(result.inviteUrl);
      formElement.reset();
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onInvite}
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
        noValidate
      >
        <h3 className="font-semibold">+ Invite Admin</h3>
        {invite.error && Object.keys(invite.errors).length === 0 ? (
          <Alert tone="danger">{invite.error}</Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="invite-email" label="Email" required error={invite.errors.email}>
            <Input
              id="invite-email"
              name="email"
              type="email"
              invalid={Boolean(invite.errors.email)}
            />
          </FormField>
          <FormField id="invite-name" label="Nama" required error={invite.errors.name}>
            <Input id="invite-name" name="name" invalid={Boolean(invite.errors.name)} />
          </FormField>
        </div>
        <Button type="submit" loading={invite.pending} className="self-start">
          {invite.pending ? "Mengirim…" : "Kirim Undangan"}
        </Button>
        {inviteUrl ? <InviteLink url={inviteUrl} /> : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="👤"
          title="Belum ada admin"
          description="Belum ada admin. Undang admin client agar mereka bisa mengelola event."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <AccessItem
              key={`${row.kind}-${row.id}`}
              eventId={eventId}
              row={row}
              onLink={setInviteUrl}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AccessItem({
  eventId,
  row,
  onLink,
}: {
  eventId: string;
  row: AccessRow;
  onLink: (url: string) => void;
}) {
  const router = useRouter();
  const action = useMutation();
  const status = STATUS[row.status] ?? { tone: "neutral" as const, label: row.status };
  const base = `/api/owner/events/${eventId}`;

  const resend = async () => {
    const result = await action.run(() =>
      apiFetch<{ inviteUrl: string }>(`${base}/invitations/${row.id}/resend`, { method: "POST" }),
    );
    if (result) {
      onLink(result.inviteUrl);
      router.refresh();
    }
  };
  const revoke = async () => {
    const path =
      row.kind === "MEMBER" ? `${base}/members/${row.id}` : `${base}/invitations/${row.id}/revoke`;
    await action.run(() => apiFetch(path, { method: row.kind === "MEMBER" ? "DELETE" : "POST" }));
    router.refresh();
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-medium">{row.email}</p>
        <p className="text-sm text-subtle">{row.name}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {row.kind === "INVITATION" ? (
          <Button size="sm" variant="secondary" loading={action.pending} onClick={resend}>
            Kirim ulang
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="text-danger" onClick={revoke}>
          Cabut
        </Button>
      </div>
      {action.error ? <p className="w-full text-sm text-danger">ⓘ {action.error}</p> : null}
    </li>
  );
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="info">
      <p className="font-medium">Link undangan (berlaku 7 hari):</p>
      <p className="mt-1 break-all font-mono text-xs">{url}</p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() =>
          navigator.clipboard
            ?.writeText(url)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? "✔ Link disalin" : "Salin Link"}
      </Button>
    </Alert>
  );
}

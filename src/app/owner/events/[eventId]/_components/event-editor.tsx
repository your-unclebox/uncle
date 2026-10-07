"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EventStatusBadge } from "@/components/shared/event-status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api-client";
import type { EventEditorData } from "@/server/http/owner-pages";

import { AccessTab } from "./access-tab";
import { BrandingTab } from "./branding-tab";
import { addThreeHours, InfoTab, type DetailsForm } from "./info-tab";
import { PublishChecklist } from "./publish-checklist";
import { SubdomainTab } from "./subdomain-tab";
import { TicketTypesTab } from "./ticket-types-tab";
import { useMutation } from "./use-mutation";

type EventForm = EventEditorData["event"];

const FIELDS: (keyof DetailsForm)[] = [
  "name",
  "description",
  "category",
  "eventType",
  "date",
  "startTime",
  "endTime",
  "venueName",
  "venueAddress",
  "mapsUrl",
  "primaryColor",
  "secondaryColor",
  "contactInfo",
  "terms",
  "refundPolicy",
];

const pickDetails = (event: EventForm): DetailsForm =>
  Object.fromEntries(FIELDS.map((field) => [field, event[field] ?? ""])) as unknown as DetailsForm;

// Warna kosong tidak dikirim (schema hanya menerima #RRGGBB).
function toPayload(form: DetailsForm) {
  return Object.fromEntries(
    Object.entries(form).filter(([key, value]) => !(key.endsWith("Color") && value === "")),
  );
}

// UI-UX Wireframe §2.3: tab + checklist sticky + action bar sticky.
export function EventEditor({ data }: { data: EventEditorData }) {
  const router = useRouter();
  const [tab, setTab] = useState("info");
  const [saved, setSaved] = useState<DetailsForm>(() => pickDetails(data.event));
  const [form, setForm] = useState<DetailsForm>(saved);
  const [version, setVersion] = useState(data.event.version);
  const [status, setStatus] = useState(data.event.status);
  const [endTouched, setEndTouched] = useState(Boolean(data.event.endTime));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const save = useMutation();
  const publish = useMutation();
  const dirty = useMemo(() => FIELDS.some((field) => form[field] !== saved[field]), [form, saved]);

  const onChange = (field: keyof DetailsForm, value: string) => {
    if (field === "endTime") setEndTouched(true);
    setForm((current) => ({ ...current, [field]: value }));
  };
  const onStartTimeChange = (value: string) =>
    setForm((current) => ({
      ...current,
      startTime: value,
      endTime: !endTouched && value ? addThreeHours(value) : current.endTime,
    }));

  async function saveDetails(): Promise<boolean> {
    const updated = await save.run(
      () =>
        apiFetch<EventForm>(`/api/owner/events/${data.event.id}`, {
          method: "PATCH",
          ifMatch: version,
          body: toPayload(form),
        }),
      "Perubahan disimpan",
    );
    if (!updated) return false;
    const details = pickDetails(updated);
    setSaved(details);
    setForm(details);
    setVersion(updated.version);
    router.refresh();
    return true;
  }

  async function onPublish() {
    setConfirmOpen(false);
    if (dirty && !(await saveDetails())) return;
    const published = await publish.run(
      () => apiFetch<EventForm>(`/api/owner/events/${data.event.id}/publish`, { method: "POST" }),
      "Event dipublikasikan",
    );
    if (published) {
      setStatus(published.status);
      setVersion(published.version);
    }
    router.refresh();
  }

  const conflict = save.errorCode === "VERSION_CONFLICT";

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Edit Event: {saved.name}</h1>
        <EventStatusBadge status={status} />
      </div>

      {conflict ? (
        <Alert tone="danger">
          {save.error}{" "}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Muat ulang
          </button>
        </Alert>
      ) : save.error && Object.keys(save.errors).length === 0 ? (
        <Alert tone="danger">{save.error}</Alert>
      ) : null}
      {save.success && !dirty ? <Alert tone="success">{save.success}</Alert> : null}
      {publish.error ? <Alert tone="danger">{publish.error}</Alert> : null}
      {publish.success ? <Alert tone="success">✔ {publish.success}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="info">Info Umum</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="tickets">Jenis Tiket</TabsTrigger>
            <TabsTrigger value="subdomain">Subdomain</TabsTrigger>
            <TabsTrigger value="access">Akses Admin</TabsTrigger>
          </TabsList>
          <div className="pt-6">
            <TabsContent value="info">
              <InfoTab
                form={form}
                errors={save.errors}
                onChange={onChange}
                onStartTimeChange={onStartTimeChange}
              />
            </TabsContent>
            <TabsContent value="branding">
              <BrandingTab form={form} errors={save.errors} onChange={onChange} />
            </TabsContent>
            <TabsContent value="tickets">
              <TicketTypesTab eventId={data.event.id} ticketTypes={data.ticketTypes} />
            </TabsContent>
            <TabsContent value="subdomain">
              <SubdomainTab
                eventId={data.event.id}
                currentSlug={data.event.slug}
                baseDomain={data.baseDomain}
              />
            </TabsContent>
            <TabsContent value="access">
              <AccessTab eventId={data.event.id} rows={data.access} />
            </TabsContent>
          </div>
        </Tabs>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <PublishChecklist items={data.checklist} onGoTo={setTab} />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg md:px-8">
        {dirty ? (
          <span className="mr-auto text-sm text-pending">Perubahan belum disimpan •</span>
        ) : null}
        <Button variant="secondary" loading={save.pending} disabled={!dirty} onClick={saveDetails}>
          {status === "DRAFT" ? "Simpan Draft" : "Simpan"}
        </Button>
        {status === "DRAFT" ? (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button loading={publish.pending} onClick={() => setConfirmOpen(true)}>
              Simpan &amp; Publish
            </Button>
            <DialogContent
              title="Publish event?"
              description={`Landing page akan langsung live di ${data.event.slug ?? "subdomain event"}.${data.baseDomain} dan bisa diakses publik.`}
            >
              <div className="flex justify-end gap-3">
                <DialogClose asChild>
                  <Button variant="secondary">Batal</Button>
                </DialogClose>
                <Button onClick={onPublish}>Publish</Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

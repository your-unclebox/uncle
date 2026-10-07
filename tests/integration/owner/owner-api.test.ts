import { beforeAll, describe, expect, inject, it } from "vitest";

import { createEvent, useTestDatabase } from "../../fixtures/db";
import { body, cookieFrom, ctx, makeRequest } from "../../fixtures/http";
import { createEventAdmin, createOwnerUser, PASSWORD } from "../../fixtures/identity";

type Handlers = {
  login: typeof import("@/app/api/auth/login/route");
  logout: typeof import("@/app/api/auth/logout/route");
  me: typeof import("@/app/api/auth/me/route");
  invitationInfo: typeof import("@/app/api/auth/invitations/[token]/route");
  accept: typeof import("@/app/api/auth/invitations/[token]/accept/route");
  summary: typeof import("@/app/api/owner/summary/route");
  events: typeof import("@/app/api/owner/events/route");
  event: typeof import("@/app/api/owner/events/[eventId]/route");
  slug: typeof import("@/app/api/owner/events/[eventId]/slug/route");
  slugAvailability: typeof import("@/app/api/owner/slugs/[slug]/availability/route");
  ticketTypes: typeof import("@/app/api/owner/events/[eventId]/ticket-types/route");
  checklist: typeof import("@/app/api/owner/events/[eventId]/publish-checklist/route");
  publish: typeof import("@/app/api/owner/events/[eventId]/publish/route");
  invitations: typeof import("@/app/api/owner/events/[eventId]/invitations/route");
  members: typeof import("@/app/api/owner/events/[eventId]/members/route");
};

// Route handler diuji langsung (Request → Response) terhadap Postgres asli.
describe("Auth & Owner API (DRD API §3–4)", () => {
  const db = useTestDatabase();
  let api: Handlers;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    api = {
      login: await import("@/app/api/auth/login/route"),
      logout: await import("@/app/api/auth/logout/route"),
      me: await import("@/app/api/auth/me/route"),
      invitationInfo: await import("@/app/api/auth/invitations/[token]/route"),
      accept: await import("@/app/api/auth/invitations/[token]/accept/route"),
      summary: await import("@/app/api/owner/summary/route"),
      events: await import("@/app/api/owner/events/route"),
      event: await import("@/app/api/owner/events/[eventId]/route"),
      slug: await import("@/app/api/owner/events/[eventId]/slug/route"),
      slugAvailability: await import("@/app/api/owner/slugs/[slug]/availability/route"),
      ticketTypes: await import("@/app/api/owner/events/[eventId]/ticket-types/route"),
      checklist: await import("@/app/api/owner/events/[eventId]/publish-checklist/route"),
      publish: await import("@/app/api/owner/events/[eventId]/publish/route"),
      invitations: await import("@/app/api/owner/events/[eventId]/invitations/route"),
      members: await import("@/app/api/owner/events/[eventId]/members/route"),
    };
  });

  async function loginAs(email: string): Promise<string> {
    const response = await api.login.POST(
      makeRequest("POST", "/api/auth/login", { body: { email, password: PASSWORD } }),
      undefined as never,
    );
    expect(response.status).toBe(200);
    return cookieFrom(response);
  }

  it("login: cookie __Host- HttpOnly Secure SameSite=Lax; gagal → 401 Problem Details", async () => {
    const owner = await createOwnerUser(db);
    const ok = await api.login.POST(
      makeRequest("POST", "/api/auth/login", { body: { email: owner.email, password: PASSWORD } }),
      undefined as never,
    );
    expect(ok.headers.get("set-cookie")).toMatch(
      /^__Host-uncle_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Expires=/,
    );

    const bad = await api.login.POST(
      makeRequest("POST", "/api/auth/login", { body: { email: owner.email, password: "salah" } }),
      undefined as never,
    );
    expect(bad.status).toBe(401);
    expect(bad.headers.get("content-type")).toBe("application/problem+json");
    expect(await body(bad)).toMatchObject({
      code: "INVALID_CREDENTIALS",
      title: "Email atau password salah",
      status: 401,
    });
  });

  it("CSRF: mutasi tanpa Origin atau beda origin → 403", async () => {
    const owner = await createOwnerUser(db);
    for (const origin of [null, "https://evil.example"]) {
      const response = await api.login.POST(
        makeRequest("POST", "/api/auth/login", {
          body: { email: owner.email, password: PASSWORD },
          origin,
        }),
        undefined as never,
      );
      expect(response.status).toBe(403);
    }
  });

  it("AC-OWN-01.3: area Owner → 401 tanpa login, 403 untuk Admin", async () => {
    const event = await createEvent(db);
    const admin = await createEventAdmin(db, event.id);
    expect(
      (await api.summary.GET(makeRequest("GET", "/api/owner/summary"), undefined as never)).status,
    ).toBe(401);

    const cookie = await loginAs(admin.email);
    const response = await api.summary.GET(
      makeRequest("GET", "/api/owner/summary", { cookie }),
      undefined as never,
    );
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("alur Owner: buat Draft → isi → slug → jenis tiket → checklist → publish", async () => {
    const owner = await createOwnerUser(db);
    const cookie = await loginAs(owner.email);

    const created = await api.events.POST(
      makeRequest("POST", "/api/owner/events", { cookie, body: { name: "Teater Bagol" } }),
      undefined as never,
    );
    expect(created.status).toBe(201);
    const draft = await body<{ id: string; version: number; status: string }>(created);
    expect(draft.status).toBe("DRAFT");
    const params = ctx({ eventId: draft.id });

    const noIfMatch = await api.event.PATCH(
      makeRequest("PATCH", `/api/owner/events/${draft.id}`, { cookie, body: { name: "X" } }),
      params,
    );
    expect(noIfMatch.status).toBe(400);

    const patched = await api.event.PATCH(
      makeRequest("PATCH", `/api/owner/events/${draft.id}`, {
        cookie,
        ifMatch: draft.version,
        body: {
          name: "Teater Bagol",
          date: "2026-12-20",
          startTime: "19:00",
          endTime: "22:00",
          venueName: "Gedung Kesenian",
        },
      }),
      params,
    );
    expect(await body(patched)).toMatchObject({ version: 2, timeRange: "19:00–22:00 WIB" });

    const slug = `api-${crypto.randomUUID().slice(0, 8)}`;
    const available = await api.slugAvailability.GET(
      makeRequest("GET", `/api/owner/slugs/${slug}/availability`, { cookie }),
      ctx({ slug }),
    );
    expect(await body(available)).toEqual({ available: true });
    expect(
      (
        await api.slug.PUT(
          makeRequest("PUT", `/api/owner/events/${draft.id}/slug`, { cookie, body: { slug } }),
          params,
        )
      ).status,
    ).toBe(200);

    const ticketType = await api.ticketTypes.POST(
      makeRequest("POST", `/api/owner/events/${draft.id}/ticket-types`, {
        cookie,
        body: { name: "Reguler", price: 75_000, quota: 150 },
      }),
      params,
    );
    expect(await body(ticketType)).toMatchObject({ name: "Reguler", price: 75_000, quota: 150 });

    const checklist = await body<{ items: { done: boolean }[] }>(
      await api.checklist.GET(
        makeRequest("GET", `/api/owner/events/${draft.id}/publish-checklist`, { cookie }),
        params,
      ),
    );
    expect(checklist.items.every((item) => item.done)).toBe(true);

    const published = await api.publish.POST(
      makeRequest("POST", `/api/owner/events/${draft.id}/publish`, { cookie }),
      params,
    );
    expect(await body(published)).toMatchObject({ status: "ACTIVE", slug });

    const list = await body<{ data: { id: string }[] }>(
      await api.events.GET(
        makeRequest("GET", "/api/owner/events?status=ACTIVE", { cookie }),
        undefined as never,
      ),
    );
    expect(list.data.some((row) => row.id === draft.id)).toBe(true);
    const summary = await body(
      await api.summary.GET(
        makeRequest("GET", "/api/owner/summary", { cookie }),
        undefined as never,
      ),
    );
    expect(summary).toMatchObject({
      activeEvents: expect.any(Number),
      revenue: expect.any(Number),
    });
  });

  it("event tidak ada / id tidak valid → 404 EVENT_NOT_FOUND; error validasi per field", async () => {
    const owner = await createOwnerUser(db);
    const cookie = await loginAs(owner.email);
    for (const eventId of [crypto.randomUUID(), "bukan-uuid"]) {
      const response = await api.event.GET(
        makeRequest("GET", `/api/owner/events/${eventId}`, { cookie }),
        ctx({ eventId }),
      );
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ code: "EVENT_NOT_FOUND" });
    }
    const invalid = await api.events.POST(
      makeRequest("POST", "/api/owner/events", { cookie, body: { name: "" } }),
      undefined as never,
    );
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toMatchObject({
      code: "VALIDATION_ERROR",
      errors: { name: ["Wajib diisi"] },
    });
  });

  it("undangan via API → link → terima → admin login; logout mencabut sesi", async () => {
    const owner = await createOwnerUser(db);
    const ownerCookie = await loginAs(owner.email);
    const event = await createEvent(db, { name: "Teater Bagol" });
    const params = ctx({ eventId: event.id });

    const invited = await body<{ inviteUrl: string }>(
      await api.invitations.POST(
        makeRequest("POST", `/api/owner/events/${event.id}/invitations`, {
          cookie: ownerCookie,
          body: { email: "rina.api@teaterbagol.com", name: "Rina" },
        }),
        params,
      ),
    );
    const token = invited.inviteUrl.split("/undangan/")[1] ?? "";
    expect(
      await body(
        await api.invitationInfo.GET(
          makeRequest("GET", `/api/auth/invitations/${token}`),
          ctx({ token }),
        ),
      ),
    ).toMatchObject({ eventName: "Teater Bagol", email: "rina.api@teaterbagol.com" });

    const accepted = await api.accept.POST(
      makeRequest("POST", `/api/auth/invitations/${token}/accept`, {
        body: { name: "Rina", password: PASSWORD },
      }),
      ctx({ token }),
    );
    const adminCookie = cookieFrom(accepted);
    expect(
      await body(
        await api.me.GET(
          makeRequest("GET", "/api/auth/me", { cookie: adminCookie }),
          undefined as never,
        ),
      ),
    ).toMatchObject({ isOwner: false, adminEventIds: [event.id] });
    const members = await body<{ data: { email: string }[] }>(
      await api.members.GET(
        makeRequest("GET", `/api/owner/events/${event.id}/members`, { cookie: ownerCookie }),
        params,
      ),
    );
    expect(members.data.map((m) => m.email)).toEqual(["rina.api@teaterbagol.com"]);

    const logout = await api.logout.POST(
      makeRequest("POST", "/api/auth/logout", { cookie: adminCookie }),
      undefined as never,
    );
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      (
        await api.me.GET(
          makeRequest("GET", "/api/auth/me", { cookie: adminCookie }),
          undefined as never,
        )
      ).status,
    ).toBe(401);
  });
});

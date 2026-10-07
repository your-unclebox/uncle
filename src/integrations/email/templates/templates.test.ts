import { describe, expect, it } from "vitest";

import {
  adminInviteEmail,
  cashReservationEmail,
  reservationExpiredEmail,
  TICKET_QR_CID,
  ticketIssuedEmail,
  type EventSummary,
} from "./templates";

const event: EventSummary = {
  name: 'Teater <Bagol> & "Kawan"',
  dateLabel: "Minggu, 20 Des 2026",
  timeRange: "19:00–22:00 WIB",
  venue: "Gedung Kesenian",
  mapsUrl: "https://maps.app/x",
  primaryColor: "#7C3AED",
  contact: "panitia@teater.id",
};
const order = {
  code: "UNC-7K3P9Q",
  items: [
    { name: "Reguler", quantity: 2, unitPrice: 75_000 },
    { name: "VIP", quantity: 1, unitPrice: 150_000 },
  ],
  totalAmount: 300_000,
};
const orderUrl = "https://teaterbagol.uncle.id/pesanan/UNC-7K3P9Q?t=abc";

describe("template email (DRD Integrations §2)", () => {
  it("TICKET_ISSUED: QR inline, kode, ringkasan, Lunas, tautan cadangan; nilai di-escape", () => {
    const email = ticketIssuedEmail({ event, order, orderUrl });
    expect(email.subject).toBe('Tiket Teater <Bagol> & "Kawan" — UNC-7K3P9Q');
    expect(email.html).toContain(`cid:${TICKET_QR_CID}`);
    expect(email.html).toContain("UNC-7K3P9Q");
    expect(email.html).toContain("Rp 300.000");
    expect(email.html).toContain("✔ Lunas");
    expect(email.html).toContain(orderUrl.replace("&", "&amp;"));
    expect(email.html).toContain("Teater &lt;Bagol&gt; &amp; &quot;Kawan&quot;");
    expect(email.html).not.toContain("<Bagol>");
    expect(email.text).toContain("19:00–22:00 WIB");
  });

  it("CASH_RESERVATION: nominal tunai + batas reservasi", () => {
    const email = cashReservationEmail({
      event,
      order,
      orderUrl,
      reservationDeadline: "Minggu, 20 Des 2026 22:00 WIB",
    });
    expect(email.html).toContain("Siapkan uang tunai <strong>Rp 300.000</strong>");
    expect(email.html).toContain(
      "Reservasi berlaku sampai <strong>Minggu, 20 Des 2026 22:00 WIB</strong>",
    );
    expect(email.html).toContain("Belum bayar");
  });

  it("tautan peta non-http dan warna tidak valid diabaikan", () => {
    const email = ticketIssuedEmail({
      event: { ...event, mapsUrl: "javascript:alert(1)", primaryColor: "red;x" },
      order,
      orderUrl,
    });
    expect(email.html).not.toContain("javascript:");
    expect(email.html).not.toContain("red;x");
  });

  it("RESERVATION_EXPIRED & ADMIN_INVITE", () => {
    const expired = reservationExpiredEmail({
      event,
      orderCode: "UNC-2M8R4T",
      siteUrl: "https://teaterbagol.uncle.id",
    });
    expect(expired.subject).toContain("kedaluwarsa");
    expect(expired.text).toContain("tidak berlaku lagi");

    const invite = adminInviteEmail({
      eventName: "Teater Bagol",
      inviteeName: "Rina",
      acceptUrl: "https://app.uncle.id/undangan/tok",
      expiresLabel: "14 Okt 2026",
    });
    expect(invite.html).toContain('href="https://app.uncle.id/undangan/tok"');
    expect(invite.text).toContain("Aktifkan akun: https://app.uncle.id/undangan/tok");
  });
});

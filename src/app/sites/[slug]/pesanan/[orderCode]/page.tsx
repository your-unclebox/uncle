import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { loadOrderPage } from "@/server/http/storefront-pages";

import { PendingPayment } from "../../_components/checkout/pending-payment";
import { TicketReady } from "../../_components/checkout/ticket-ready";
import { EventFooter } from "../../_components/event-footer";
import { EventHeader } from "../../_components/event-header";
import { StorefrontTheme } from "../../_components/storefront-theme";

// Halaman pesanan customer (DRD Auth §4: /pesanan/{orderCode}?t={accessToken}).
// Token di URL → jangan diindeks & jangan dikirim sebagai Referer.
export const metadata: Metadata = {
  title: "Pesanan",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/sites/[slug]/pesanan/[orderCode]">;

export default function OrderPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrderContent({ params, searchParams }: Props) {
  await connection();
  const { slug, orderCode } = await params;
  const token = (await searchParams).t;
  const accessToken = typeof token === "string" ? token : null;
  const data = await loadOrderPage(slug, orderCode, accessToken);
  if (!data) notFound();
  const { event, order } = data;

  return (
    <StorefrontTheme event={event}>
      <EventHeader eventName={event.name} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Pesanan Kamu</h1>
        {order?.payment && accessToken ? (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-6">
            <PendingPayment
              orderCode={order.code}
              accessToken={accessToken}
              qrString={order.payment.qrString}
              expiresAt={order.payment.expiresAt}
              totalAmount={order.totalAmount}
            />
          </div>
        ) : order ? (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm md:p-6">
            <TicketReady
              event={event}
              order={{
                code: order.code,
                status: order.status,
                paymentMethod: order.paymentMethod,
                totalAmount: order.totalAmount,
                items: order.items,
                qrPayload: order.ticket?.qrPayload ?? null,
                ticketStatus: order.ticket?.status ?? null,
                customer: order.customer,
                emailStatus: order.emailStatus,
              }}
              accessToken={accessToken}
            />
          </div>
        ) : (
          <Alert tone="danger">
            ⚠ Pesanan tidak ditemukan. Gunakan tombol &quot;Cek Pesanan&quot; dengan kode pesanan
            dan no HP kamu.
          </Alert>
        )}
        <Link href="/" className="text-sm font-medium text-primary">
          ← Kembali ke halaman event
        </Link>
      </main>
      <EventFooter event={event} />
    </StorefrontTheme>
  );
}

function OrderSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-8">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="aspect-square w-60" />
      <Skeleton className="h-5 w-1/3" />
    </div>
  );
}

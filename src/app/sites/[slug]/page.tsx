import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { loadStorefront, loadStorefrontTitle } from "@/server/http/storefront-pages";

import { CheckoutProvider } from "./_components/checkout/checkout-context";
import {
  OrderSummarySidebar,
  StickyCheckoutBar,
  TicketSection,
} from "./_components/checkout/ticket-section";
import { DescriptionSection } from "./_components/description-section";
import { EventFooter } from "./_components/event-footer";
import { EventHeader } from "./_components/event-header";
import { EventHero } from "./_components/event-hero";
import { LocationSection } from "./_components/location-section";
import { SectionTabNav } from "./_components/section-tab-nav";
import { ShareBar } from "./_components/share-bar";
import { StorefrontTheme } from "./_components/storefront-theme";

// Landing page {slug}.uncle.id (LP-01…LP-16). Struktur section tetap:
// Header → Hero → Share → Tab nav → Deskripsi → Dokumentasi → Tiket → Lokasi → Footer.

export async function generateMetadata({ params }: PageProps<"/sites/[slug]">): Promise<Metadata> {
  await connection();
  const title = await loadStorefrontTitle((await params).slug);
  return { title: title ?? "Event tidak ditemukan" };
}

export default function LandingPage({ params }: PageProps<"/sites/[slug]">) {
  return (
    <Suspense fallback={<LandingSkeleton />}>
      <Landing params={params} />
    </Suspense>
  );
}

async function Landing({ params }: Pick<PageProps<"/sites/[slug]">, "params">) {
  await connection();
  const data = await loadStorefront((await params).slug);
  if (!data) notFound();
  const { event, ticketTypes } = data;

  const available = ticketTypes.filter((type) => type.remaining > 0);
  const startingPrice =
    ticketTypes.length > 0
      ? Math.min(...(available.length > 0 ? available : ticketTypes).map((type) => type.price))
      : null;
  const ctaState =
    event.salesState === "closed" ? "closed" : available.length === 0 ? "soldOut" : "available";

  // Dokumentasi disembunyikan bila belum ada media (UI-UX States §1).
  const sections = [
    { id: "deskripsi", label: "Deskripsi" },
    { id: "tiket", label: "Tiket" },
    ...(event.venueName || event.venueAddress ? [{ id: "lokasi", label: "Lokasi" }] : []),
  ];

  return (
    <StorefrontTheme event={event}>
      <EventHeader eventName={event.name} />
      <main className="flex flex-1 flex-col">
        <EventHero event={event} startingPrice={startingPrice} ctaState={ctaState} />
        <ShareBar eventName={event.name} />
        <SectionTabNav sections={sections} />
        <CheckoutProvider event={event} initialTicketTypes={ticketTypes}>
          <div className="mx-auto grid w-full max-w-[1200px] gap-x-8 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
            <div className="min-w-0">
              <DescriptionSection event={event} />
              <section
                id="tiket"
                aria-labelledby="tiket-title"
                className="scroll-mt-32 pb-10 lg:pb-16"
              >
                <h2 id="tiket-title" className="mb-4 text-xl font-semibold md:text-2xl">
                  Tiket
                </h2>
                <TicketSection />
              </section>
            </div>
            <aside className="hidden pt-10 lg:block lg:pt-16" aria-label="Ringkasan pesanan">
              <OrderSummarySidebar />
            </aside>
          </div>
          <LocationSection event={event} />
          <EventFooter event={event} />
          <StickyCheckoutBar />
        </CheckoutProvider>
      </main>
    </StorefrontTheme>
  );
}

function LandingSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-surface" aria-busy="true">
      <div className="h-14 border-b border-border md:h-16" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 md:px-6 md:pt-6 lg:px-8">
        <Skeleton className="aspect-[16/9] max-h-[480px] w-full md:rounded-xl" />
        <div className="flex flex-col gap-3 px-4 md:px-0">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-6 h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "@/lib/api-client";
import type { PublicTicketType } from "@/server/modules/catalog/public-ticket-types";
import type { PublicEvent } from "@/server/modules/tenancy/storefront";

import type { TicketOrderView } from "./ticket-ready";

// State checkout Step 1–5 (UI-UX §1.3), dipakai section Tiket, sidebar
// Ringkasan (desktop), dan sticky bottom bar (mobile).

export type CheckoutStep = "select" | "customer" | "payment" | "pay" | "done";
export type PaymentChoice = "CASH" | "QRIS";

export interface CustomerInput {
  name: string;
  phone: string;
  email: string;
}

export interface CreatedOrder {
  readonly order: {
    readonly code: string;
    readonly status: string;
    readonly paymentMethod: PaymentChoice;
    readonly totalAmount: number;
    readonly expiresAt: string | null;
    readonly items: ReadonlyArray<{ name: string; quantity: number; unitPrice: number }>;
  };
  // Cash: QR Tiket langsung; QRIS: QR pembayaran dulu (Step 4).
  readonly ticket: { readonly status: string; readonly qrPayload: string } | null;
  readonly payment: {
    readonly method: "QRIS";
    readonly qrString: string;
    readonly expiresAt: string | null;
  } | null;
  readonly accessToken: string;
}

export interface SelectedLine {
  readonly ticketType: PublicTicketType;
  readonly quantity: number;
}

interface CheckoutValue {
  readonly event: PublicEvent;
  readonly ticketTypes: readonly PublicTicketType[];
  readonly quantities: Readonly<Record<string, number>>;
  readonly lines: readonly SelectedLine[];
  readonly totalQuantity: number;
  readonly totalAmount: number;
  readonly startingPrice: number | null;
  readonly soldOut: boolean;
  readonly step: CheckoutStep;
  readonly customer: CustomerInput;
  readonly method: PaymentChoice;
  readonly created: CreatedOrder | null;
  /** Order QRIS yang sudah Lunas (dari endpoint tiket), untuk Step 5. */
  readonly paidOrder: TicketOrderView | null;
  maxFor(ticketType: PublicTicketType): number;
  setQuantity(ticketTypeId: string, quantity: number): void;
  setCustomer(customer: CustomerInput): void;
  setMethod(method: PaymentChoice): void;
  goTo(step: CheckoutStep): void;
  complete(created: CreatedOrder): void;
  markPaid(order: TicketOrderView): void;
  refreshTicketTypes(): Promise<readonly PublicTicketType[]>;
  reset(): void;
}

const CheckoutContext = createContext<CheckoutValue | null>(null);

export function useCheckout(): CheckoutValue {
  const value = useContext(CheckoutContext);
  if (!value) throw new Error("useCheckout harus di dalam CheckoutProvider");
  return value;
}

function scrollToTickets() {
  document.getElementById("tiket")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function CheckoutProvider({
  event,
  initialTicketTypes,
  children,
}: {
  event: PublicEvent;
  initialTicketTypes: readonly PublicTicketType[];
  children: ReactNode;
}) {
  const [ticketTypes, setTicketTypes] = useState(initialTicketTypes);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [step, setStep] = useState<CheckoutStep>("select");
  const [customer, setCustomer] = useState<CustomerInput>({ name: "", phone: "", email: "" });
  const [method, setMethod] = useState<PaymentChoice>(event.paymentMethods.qris ? "QRIS" : "CASH");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [paidOrder, setPaidOrder] = useState<TicketOrderView | null>(null);

  const lines = useMemo(
    () =>
      ticketTypes
        .map((ticketType) => ({ ticketType, quantity: quantities[ticketType.id] ?? 0 }))
        .filter((line) => line.quantity > 0),
    [ticketTypes, quantities],
  );
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = lines.reduce((sum, line) => sum + line.quantity * line.ticketType.price, 0);
  const available = ticketTypes.filter((type) => type.remaining > 0);
  const soldOut = available.length === 0;
  const startingPrice =
    ticketTypes.length > 0
      ? Math.min(...(available.length > 0 ? available : ticketTypes).map((type) => type.price))
      : null;

  // Batas stepper = min(kuota tersisa, sisa jatah per transaksi) (UI-UX QuantityStepper).
  const maxFor = useCallback(
    (ticketType: PublicTicketType) => {
      const current = quantities[ticketType.id] ?? 0;
      const others = totalQuantity - current;
      return Math.max(0, Math.min(ticketType.remaining, event.maxTicketsPerOrder - others));
    },
    [quantities, totalQuantity, event.maxTicketsPerOrder],
  );

  const setQuantity = useCallback(
    (ticketTypeId: string, quantity: number) => {
      const ticketType = ticketTypes.find((type) => type.id === ticketTypeId);
      if (!ticketType) return;
      const clamped = Math.max(0, Math.min(quantity, maxFor(ticketType)));
      setQuantities((previous) => ({ ...previous, [ticketTypeId]: clamped }));
    },
    [ticketTypes, maxFor],
  );

  const goTo = useCallback((next: CheckoutStep) => {
    setStep(next);
    // Desktop: step tampil inline di section Tiket; mobile: full-screen sheet.
    if (next === "select" || window.matchMedia("(min-width: 768px)").matches) {
      requestAnimationFrame(scrollToTickets);
    }
  }, []);

  const refreshTicketTypes = useCallback(async () => {
    const { data } = await apiFetch<{ data: PublicTicketType[] }>("/api/public/ticket-types");
    setTicketTypes(data);
    // Pilihan disesuaikan dengan kuota terbaru (UI-UX States: kuota berubah saat checkout).
    setQuantities((previous) =>
      Object.fromEntries(
        data.map((type) => [type.id, Math.min(previous[type.id] ?? 0, type.remaining)]),
      ),
    );
    return data;
  }, []);

  const complete = useCallback((order: CreatedOrder) => {
    setCreated(order);
    setPaidOrder(null);
    setStep(order.payment ? "pay" : "done");
  }, []);

  const markPaid = useCallback((order: TicketOrderView) => {
    setPaidOrder(order);
    setStep("done");
  }, []);

  const reset = useCallback(() => {
    setQuantities({});
    setCreated(null);
    setPaidOrder(null);
    setStep("select");
    void refreshTicketTypes().catch(() => undefined);
    requestAnimationFrame(scrollToTickets);
  }, [refreshTicketTypes]);

  const value: CheckoutValue = {
    event,
    ticketTypes,
    quantities,
    lines,
    totalQuantity,
    totalAmount,
    startingPrice,
    soldOut,
    step,
    customer,
    method,
    created,
    paidOrder,
    maxFor,
    setQuantity,
    setCustomer,
    setMethod,
    goTo,
    complete,
    markPaid,
    refreshTicketTypes,
    reset,
  };

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export { scrollToTickets };

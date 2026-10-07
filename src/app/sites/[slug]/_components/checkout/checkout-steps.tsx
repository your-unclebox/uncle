"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { customerSchema } from "@/server/modules/ordering/schemas";

import { useCheckout, type CreatedOrder, type CustomerInput } from "./checkout-context";
import { PaymentWaiting } from "./payment-waiting";
import { TicketReady, type TicketOrderView } from "./ticket-ready";

// Step 2–5 (UI-UX §1.3): inline di section Tiket (≥ md), full-screen sheet di HP.

const STEP_LABELS = [
  { key: "select", label: "Tiket" },
  { key: "customer", label: "Data Diri" },
  { key: "payment", label: "Pembayaran" },
  { key: "pay", label: "Bayar" },
  { key: "done", label: "Tiket Siap" },
] as const;

function CheckoutStepper() {
  const { step, method } = useCheckout();
  // Step ④ disembunyikan untuk Cash.
  const steps = STEP_LABELS.filter((item) => method === "QRIS" || item.key !== "pay");
  const currentIndex = steps.findIndex((item) => item.key === step);
  return (
    <ol
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      aria-label="Langkah checkout"
    >
      {steps.map((item, index) => (
        <li
          key={item.key}
          aria-current={index === currentIndex ? "step" : undefined}
          className={cn(
            "flex items-center gap-2",
            index === currentIndex ? "font-semibold text-primary" : "text-subtle",
          )}
        >
          {index > 0 ? <span aria-hidden>──</span> : null}
          <span>
            {index + 1}. {item.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepFrame({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const { step, method } = useCheckout();
  const total = method === "QRIS" ? 5 : 4;
  const position = { select: 1, customer: 2, payment: 3, pay: 4, done: total }[step];
  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-surface md:static md:z-auto md:overflow-visible md:rounded-xl md:border md:border-border md:shadow-sm"
      role="region"
      aria-label={title}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5 p-4 md:max-w-none md:p-6">
        <div className="flex items-center justify-between gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 rounded px-2 py-2 font-medium text-primary"
            >
              ← Kembali
            </button>
          ) : (
            <span />
          )}
          <span className="text-sm text-subtle">
            Langkah {position} dari {total}
          </span>
        </div>
        <div className="hidden md:block">
          <CheckoutStepper />
        </div>
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const REQUIRED = "Wajib diisi";
type CustomerErrors = Partial<Record<keyof CustomerInput, string>>;

// Validasi sama dengan server (BR-TRX-02/03), plus "Wajib diisi" untuk field kosong.
function validateCustomer(input: CustomerInput): CustomerErrors {
  const errors: CustomerErrors = {};
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CustomerInput;
      errors[field] ??= issue.message;
    }
  }
  for (const field of ["name", "phone", "email"] as const) {
    if (!input[field].trim()) errors[field] = REQUIRED;
  }
  return errors;
}

function CustomerStep({ serverErrors }: { serverErrors: CustomerErrors }) {
  const { customer, setCustomer, goTo } = useCheckout();
  const [form, setForm] = useState(customer);
  const [errors, setErrors] = useState<CustomerErrors>(serverErrors);

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateCustomer(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setCustomer(form);
    goTo("payment");
  }

  const field = (key: keyof CustomerInput) => ({
    id: `customer-${key}`,
    value: form[key],
    invalid: Boolean(errors[key]),
    "aria-describedby": errors[key] ? `customer-${key}-error` : undefined,
    onChange: (event: { target: { value: string } }) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value })),
  });

  return (
    <StepFrame title="Data Diri" onBack={() => goTo("select")}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <FormField id="customer-name" label="Nama lengkap" required error={errors.name}>
          <Input {...field("name")} autoComplete="name" />
        </FormField>
        <FormField id="customer-phone" label="No. HP (WhatsApp)" required error={errors.phone}>
          <Input {...field("phone")} type="tel" inputMode="numeric" autoComplete="tel" />
        </FormField>
        {errors.phone && errors.phone !== REQUIRED ? (
          <p className="-mt-3 text-sm text-subtle">Contoh: 081234567890</p>
        ) : null}
        <FormField
          id="customer-email"
          label="Email"
          required
          error={errors.email}
          helper="QR Tiket dikirim ke email ini. Bukan untuk login — tidak perlu buat akun."
        >
          <Input {...field("email")} type="email" autoComplete="email" />
        </FormField>
        <Button type="submit">Lanjut →</Button>
      </form>
    </StepFrame>
  );
}

function newIdempotencyKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function PaymentStep({ onCustomerErrors }: { onCustomerErrors: (errors: CustomerErrors) => void }) {
  const checkout = useCheckout();
  const { event, lines, totalAmount, method, setMethod, customer, goTo } = checkout;
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayDown, setGatewayDown] = useState(false);
  // Satu key per percobaan pesanan → klik/jaringan ganda tidak membuat order ganda.
  const idempotencyKey = useRef(newIdempotencyKey());

  async function submit() {
    setPending(true);
    setError(null);
    setGatewayDown(false);
    try {
      const created = await apiFetch<CreatedOrder>("/api/public/orders", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey.current },
        body: {
          items: lines.map((line) => ({
            ticketTypeId: line.ticketType.id,
            quantity: line.quantity,
          })),
          customer,
          paymentMethod: method,
        },
      });
      checkout.complete(created);
    } catch (caught) {
      const problem = caught instanceof ApiError ? caught.problem : null;
      if (problem?.code === "QUOTA_INSUFFICIENT") {
        const remaining = Array.isArray(problem.remaining)
          ? (problem.remaining as Array<{ name: string; remaining: number }>)
          : [];
        const first = remaining[0];
        toast(
          first
            ? `Kuota ${first.name} tidak mencukupi, sisa ${first.remaining}`
            : "Kuota tidak mencukupi, silakan ubah pilihan",
          "danger",
        );
        await checkout.refreshTicketTypes().catch(() => undefined);
        goTo("select");
        return;
      }
      if (problem?.code === "VALIDATION_ERROR" && problem.errors) {
        const fieldErrors: CustomerErrors = {};
        for (const [key, messages] of Object.entries(problem.errors)) {
          const field = key.replace(/^customer\./, "") as keyof CustomerInput;
          const message = messages[0];
          if (message && ["name", "phone", "email"].includes(field)) fieldErrors[field] = message;
        }
        if (Object.keys(fieldErrors).length > 0) {
          onCustomerErrors(fieldErrors);
          goTo("customer");
          return;
        }
      }
      idempotencyKey.current = newIdempotencyKey();
      if (problem?.code === "PAYMENT_GATEWAY_ERROR") {
        // AC-LP-09.7: kuota sudah dilepas server; tawarkan coba lagi / Cash.
        setGatewayDown(true);
        setError("Pembayaran QRIS sedang bermasalah. Coba lagi atau pilih Cash.");
      } else if (problem?.code === "PAYMENT_METHOD_UNAVAILABLE") {
        setError("Metode pembayaran ini sedang tidak tersedia. Pilih metode lain.");
      } else if (problem?.code === "SALES_CLOSED")
        setError("Penjualan tiket untuk event ini sudah ditutup.");
      else if (problem?.code === "RATE_LIMITED") {
        setError("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
      } else if (problem?.code === "NETWORK_ERROR") setError("Tidak ada koneksi, coba lagi.");
      else setError("Pesanan gagal dibuat, coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const options = [
    ...(event.paymentMethods.qris
      ? [
          {
            value: "QRIS" as const,
            title: "QRIS",
            description: "Bayar pakai e-wallet / m-banking apa pun. Konfirmasi otomatis.",
          },
        ]
      : []),
    {
      value: "CASH" as const,
      title: "Cash",
      description: "Bayar tunai saat ambil tiket di lokasi.",
    },
  ];

  return (
    <StepFrame title="Pilih metode pembayaran" onBack={() => goTo("customer")}>
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Metode pembayaran</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border p-4",
              method === option.value
                ? "border-2 border-primary bg-primary-subtle"
                : "border-border bg-surface",
            )}
          >
            <input
              type="radio"
              name="payment-method"
              value={option.value}
              checked={method === option.value}
              onChange={() => setMethod(option.value)}
              className="mt-1 size-5 accent-[var(--color-primary)]"
            />
            <span className="flex flex-col gap-1">
              <span className="font-semibold text-ink">{option.title}</span>
              <span className="text-sm text-subtle">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <p className="text-sm text-subtle">
          Ringkasan: {lines.map((line) => `${line.quantity}× ${line.ticketType.name}`).join(", ")}
        </p>
        <p className="flex items-center justify-between text-lg font-semibold">
          <span>Total</span>
          <span className="tabular-nums" data-testid="checkout-total">
            {formatRupiah(totalAmount)}
          </span>
        </p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {gatewayDown && event.paymentMethods.cash ? (
        <Button
          variant="secondary"
          onClick={() => {
            setMethod("CASH");
            setGatewayDown(false);
            setError(null);
          }}
        >
          Pilih Cash
        </Button>
      ) : null}
      <Button loading={pending} onClick={submit}>
        {pending
          ? "Memproses pesanan…"
          : gatewayDown
            ? "Coba Lagi"
            : method === "QRIS"
              ? "Bayar Sekarang →"
              : "Pesan Sekarang →"}
      </Button>
    </StepFrame>
  );
}

function orderPageHref(code: string, accessToken: string) {
  return `/pesanan/${code}?t=${encodeURIComponent(accessToken)}`;
}

function PayStep({ created }: { created: CreatedOrder }) {
  const { markPaid, reset } = useCheckout();
  if (!created.payment) return null;
  return (
    <StepFrame title="Pembayaran QRIS">
      <PaymentWaiting
        orderCode={created.order.code}
        accessToken={created.accessToken}
        qrString={created.payment.qrString}
        expiresAt={created.payment.expiresAt}
        totalAmount={created.order.totalAmount}
        onPaid={markPaid}
        onRetry={reset}
      />
    </StepFrame>
  );
}

function DoneStep({
  created,
  paidOrder,
}: {
  created: CreatedOrder;
  paidOrder: TicketOrderView | null;
}) {
  const { event, reset } = useCheckout();
  const order: TicketOrderView = paidOrder ?? {
    code: created.order.code,
    status: created.order.status,
    paymentMethod: created.order.paymentMethod,
    totalAmount: created.order.totalAmount,
    items: created.order.items,
    qrPayload: created.ticket?.qrPayload ?? null,
    ticketStatus: created.ticket?.status ?? null,
    customer: null,
    // Email dikirim tepat setelah pesanan dibuat; status diperbarui lewat polling.
    emailStatus: "PENDING",
  };
  return (
    <StepFrame title="Tiket Siap">
      <TicketReady event={event} order={order} accessToken={created.accessToken} justCreated />
      <div className="flex flex-col gap-2 border-t border-border pt-4 md:flex-row">
        <Button variant="secondary" asChild>
          <a href={orderPageHref(created.order.code, created.accessToken)}>Buka halaman pesanan</a>
        </Button>
        <Button variant="ghost" onClick={reset}>
          Pesan tiket lagi
        </Button>
      </div>
    </StepFrame>
  );
}

export function CheckoutSteps() {
  const { step, created, paidOrder } = useCheckout();
  const [serverErrors, setServerErrors] = useState<CustomerErrors>({});

  // Sheet full-screen di HP: kunci scroll halaman di belakangnya.
  useEffect(() => {
    if (step === "select") return;
    const mobile = !window.matchMedia("(min-width: 768px)").matches;
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [step]);

  if (step === "customer") {
    return <CustomerStep key={JSON.stringify(serverErrors)} serverErrors={serverErrors} />;
  }
  if (step === "payment") return <PaymentStep onCustomerErrors={setServerErrors} />;
  if (step === "pay" && created) return <PayStep created={created} />;
  if (step === "done" && created) return <DoneStep created={created} paidOrder={paidOrder} />;
  return null;
}

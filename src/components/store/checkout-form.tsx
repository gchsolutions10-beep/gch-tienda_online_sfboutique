"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useBag } from "@/components/store/bag-store";
import { placeOrder, quoteCheckout } from "@/server/actions/store/checkout";
import { formatUsd, formatVes } from "@/lib/money";
import { FULFILLMENT, type Fulfillment } from "@/lib/orders";
import { cn } from "@/components/ui/styles";

type Quote = NonNullable<Awaited<ReturnType<typeof quoteCheckout>>>;

const field =
  "w-full min-w-0 rounded-xl border-[1.5px] border-store-line bg-store-card px-3.5 py-2.5 text-sm text-store-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-store-muted";

const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

export function CheckoutForm({
  storeName,
  options,
  states,
  carriers,
}: {
  storeName: string;
  options: {
    pickup: { info: string | null } | null;
    local: { area: string | null; cents: number } | null;
    national: { payAtDestination: boolean; cents: number } | null;
  };
  states: string[];
  carriers: string[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const bag = useBag();
  const available = (["PICKUP", "LOCAL_DELIVERY", "NATIONAL_SHIPPING"] as Fulfillment[]).filter(
    (f) => (f === "PICKUP" ? options.pickup : f === "LOCAL_DELIVERY" ? options.local : options.national) !== null,
  );
  const [fulfillment, setFulfillment] = useState<Fulfillment>(available[0] ?? "PICKUP");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));

  // Precios, stock y totales reales del servidor cada vez que cambia la bolsa o la entrega.
  const linesKey = bag.lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  useEffect(() => {
    if (!linesKey) return;
    let alive = true;
    const lines = linesKey.split(",").map((s) => {
      const [variantId, q] = s.split(":");
      return { variantId, quantity: Number(q) };
    });
    quoteCheckout({ lines, fulfillment }).then((q) => alive && setQuote(q));
    return () => {
      alive = false;
    };
  }, [linesKey, fulfillment]);

  if (!hydrated) return <div className="mt-8 h-96 animate-pulse rounded-3xl bg-store-soft" />;

  if (!bag.lines.length) {
    return (
      <div className="mt-8 rounded-3xl bg-store-card p-10 text-center shadow-sm">
        <p className="text-store-muted">Tu bolsa está vacía.</p>
        <Link href="/catalogo" className="mt-4 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-on-brand">
          Ver la colección
        </Link>
      </div>
    );
  }

  const info = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const problems = bag.lines.filter((l) => {
    const q = info.get(l.variantId);
    return q && (!q.exists || q.available < l.quantity);
  });

  function fixBag() {
    for (const l of problems) bag.setQty(l.variantId, info.get(l.variantId)?.available ?? 0);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    const get = (k: string) => String(form.get(k) ?? "");
    startTransition(async () => {
      const result = await placeOrder({
        idempotencyKey,
        lines: bag.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        fulfillment,
        name: get("name"),
        idDoc: get("idDoc"),
        phone: get("phone"),
        email: get("email"),
        state: get("state"),
        city: get("city"),
        address: get("address"),
        reference: get("reference"),
        carrier: get("carrier"),
        office: get("office"),
        notes: get("notes"),
        acceptTerms: form.get("terms") === "on",
      });
      if (result.ok) {
        bag.clear();
        router.push(`/pedido/${result.token}`);
      } else {
        setError({ message: result.error, field: result.field });
        if (result.field) document.querySelector<HTMLElement>(`[name="${result.field}"]`)?.focus();
      }
    });
  }

  const t = quote?.totals;
  const shippingText = !quote
    ? "…"
    : quote.shipping.payAtDestination
      ? "Cobro a destino"
      : quote.shipping.cents === 0
        ? quote.shipping.free
          ? "¡Gratis!"
          : "Sin costo"
        : formatUsd(quote.shipping.cents);

  return (
    <form method="post" onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {/* Datos */}
        <section className="rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-2xl font-semibold">1. Tus datos</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className={label}>Nombre y apellido</label>
              <input id="name" name="name" required autoComplete="name" className={field} />
            </div>
            <div>
              <label htmlFor="idDoc" className={label}>Cédula o RIF</label>
              <input id="idDoc" name="idDoc" required placeholder="V-12345678" className={field} />
            </div>
            <div>
              <label htmlFor="phone" className={label}>WhatsApp</label>
              <input id="phone" name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="0414-1234567" className={field} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="email" className={label}>Correo (opcional)</label>
              <input id="email" name="email" type="email" autoComplete="email" className={field} />
            </div>
          </div>
        </section>

        {/* Entrega */}
        <section className="rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-2xl font-semibold">2. Entrega</h2>
          <div role="radiogroup" aria-label="Forma de entrega" className="mt-4 grid gap-3 sm:grid-cols-3">
            {available.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={fulfillment === f}
                onClick={() => setFulfillment(f)}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition",
                  fulfillment === f ? "border-brand bg-brand-soft" : "border-store-line hover:border-store-muted",
                )}
              >
                <span aria-hidden className="text-2xl">{FULFILLMENT[f].icon}</span>
                <span className="mt-1 block text-sm font-semibold">{FULFILLMENT[f].label}</span>
                <span className="block text-xs text-store-muted">
                  {f === "PICKUP"
                    ? "Sin costo"
                    : f === "LOCAL_DELIVERY"
                      ? [options.local?.area ?? "En la ciudad", options.local?.cents ? formatUsd(options.local.cents) : "Sin costo"].join(" · ")
                      : options.national?.payAtDestination
                        ? "MRW, Zoom, Tealca… cobro a destino"
                        : `MRW, Zoom, Tealca… · ${formatUsd(options.national?.cents ?? 0)}`}
                </span>
              </button>
            ))}
          </div>

          {fulfillment === "PICKUP" && options.pickup?.info ? (
            <p className="mt-4 rounded-xl bg-store-soft p-3 text-sm">📍 {options.pickup.info}</p>
          ) : null}

          {fulfillment === "NATIONAL_SHIPPING" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="state" className={label}>Estado</label>
                <select id="state" name="state" required defaultValue="" className={field}>
                  <option value="" disabled>Elige…</option>
                  {states.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="city" className={label}>Ciudad</label>
                <input id="city" name="city" required className={field} />
              </div>
              <div>
                <label htmlFor="carrier" className={label}>Empresa de envío</label>
                <select id="carrier" name="carrier" required defaultValue="" className={field}>
                  <option value="" disabled>Elige…</option>
                  {carriers.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="office" className={label}>Oficina (opcional)</label>
                <input id="office" name="office" placeholder="Ej. MRW Av. Bolívar" className={field} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="address" className={label}>Dirección u oficina de destino</label>
                <input id="address" name="address" required className={field} />
              </div>
            </div>
          ) : null}

          {fulfillment === "LOCAL_DELIVERY" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="city" className={label}>Ciudad</label>
                <input id="city" name="city" required className={field} />
              </div>
              <div>
                <label htmlFor="reference" className={label}>Punto de referencia</label>
                <input id="reference" name="reference" className={field} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="address" className={label}>Dirección</label>
                <input id="address" name="address" required autoComplete="street-address" className={field} />
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <label htmlFor="notes" className={label}>Nota para la tienda (opcional)</label>
            <textarea id="notes" name="notes" rows={2} className={field} placeholder="Ej. Es para regalo" />
          </div>
        </section>
      </div>

      {/* Resumen */}
      <aside className="h-fit rounded-3xl bg-store-card p-5 shadow-sm sm:p-6 lg:sticky lg:top-24">
        <h2 className="font-display text-2xl font-semibold">Tu pedido</h2>
        <ul className="mt-4 divide-y divide-store-line">
          {bag.lines.map((l) => {
            const q = info.get(l.variantId);
            const price = q?.unitPriceCents ?? l.priceCents;
            return (
              <li key={l.variantId} className="flex gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
                {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-20 w-[3.75rem] shrink-0 rounded-lg object-cover" /> : null}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-store-muted">{[l.size && `Talla ${l.size}`, l.color, `${l.quantity} ud.`].filter(Boolean).join(" · ")}</p>
                  {q && !q.exists ? <p className="text-xs font-semibold text-danger">Ya no está disponible</p> : null}
                  {q && q.exists && q.available < l.quantity ? (
                    <p className="text-xs font-semibold text-danger">{q.available ? `Solo quedan ${q.available}` : "Se agotó"}</p>
                  ) : null}
                </div>
                <span className="text-sm font-semibold">{formatUsd(price * l.quantity)}</span>
              </li>
            );
          })}
        </ul>
        {problems.length ? (
          <button type="button" onClick={fixBag} className="mb-2 w-full rounded-full border-2 border-danger px-4 py-2 text-sm font-semibold text-danger">
            Ajustar mi bolsa a lo disponible
          </button>
        ) : null}

        <dl className="space-y-1.5 border-t border-store-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{t ? formatUsd(t.subtotalCents) : "…"}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Envío</dt>
            <dd className={cn(quote?.shipping.free && "font-semibold text-ok")}>{shippingText}</dd>
          </div>
          {t && quote.ivaEnabled ? (
            <div className="flex justify-between text-store-muted">
              <dt>{quote.taxMode === "PRICE_INCLUDES_TAX" ? "IVA incluido" : "IVA"}</dt>
              <dd>{formatUsd(t.ivaCents)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-store-line pt-3">
            <dt className="font-semibold">Total</dt>
            <dd className="text-right">
              <span className="block font-display text-3xl font-semibold">{t ? formatUsd(t.totalCents) : "…"}</span>
              {t ? <span className="text-xs text-store-muted">{formatVes(t.totalVesCents)} a tasa BCV</span> : null}
            </dd>
          </div>
        </dl>
        {quote && !quote.bcv ? (
          <p className="mt-3 rounded-xl bg-store-soft p-3 text-xs">La tienda aún no cargó la tasa del día. Puedes pedir por WhatsApp.</p>
        ) : null}

        <label className="mt-4 flex items-start gap-2 text-xs text-store-muted">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>
            Acepto que {storeName} me contacte por WhatsApp sobre este pedido y que las prendas se apartan por tiempo limitado hasta confirmar el pago.
          </span>
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">
            {error.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !t || problems.length > 0}
          className="mt-4 w-full rounded-full bg-brand px-4 py-3.5 font-semibold text-on-brand transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Creando tu pedido…" : "Confirmar pedido"}
        </button>
        <p className="mt-2 text-center text-xs text-store-muted">En el siguiente paso eliges cómo pagar: Pago Móvil, transferencia, Zelle o USDT.</p>
      </aside>
    </form>
  );
}

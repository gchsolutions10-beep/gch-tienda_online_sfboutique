import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { releaseExpiredReservations } from "@/server/services/orders";
import { PaymentReport, type CheckoutAccount } from "@/components/store/payment-report";
import { formatMoney, formatUsd, formatVes, toCents, usdToVesCents } from "@/lib/money";
import { customerSteps, FULFILLMENT, ORDER_STATUS, timeLeft, UNPAID_STATUSES } from "@/lib/orders";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
import { formatVePhone, whatsappLink } from "@/lib/ve-ids";
import { cn } from "@/components/ui/styles";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

const PAYMENT_STATUS_LABEL = { PENDING_REVIEW: "Por verificar", CONFIRMED: "Confirmado", REJECTED: "Rechazado", REFUNDED: "Reembolsado" } as const;

export default async function OrderTrackingPage({ params }: PageProps<"/t/[domain]/pedido/[token]">) {
  const { domain, token } = await params;
  const tenant = await getTenant(domain);
  await releaseExpiredReservations(tenant.id);
  const tdb = tenantDb(tenant.id);
  const order = await tdb.order.findFirst({
    where: { trackingToken: token },
    include: {
      items: { include: { product: { select: { slug: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } } },
      payments: { orderBy: { createdAt: "asc" }, select: { id: true, method: true, currency: true, amount: true, amountUsd: true, status: true, reference: true, createdAt: true } },
    },
  });
  if (!order) notFound();

  const [rates, accounts] = await Promise.all([
    getCurrentRates(tenant.id),
    tdb.financialAccount.findMany({
      where: { isActive: true, showInCheckout: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, type: true, currency: true, bankName: true, bankCode: true, accountNumber: true, holderName: true, holderIdType: true, holderIdNumber: true, phone: true, email: true, walletId: true },
    }),
  ]);

  const totalCents = toCents(order.totalUsd);
  const confirmed = order.payments.filter((p) => p.status === "CONFIRMED").reduce((a, p) => a + toCents(p.amountUsd), 0);
  const inReview = order.payments.filter((p) => p.status === "PENDING_REVIEW").reduce((a, p) => a + toCents(p.amountUsd), 0);
  const remaining = Math.max(0, totalCents - confirmed - inReview);
  const unpaid = UNPAID_STATUSES.includes(order.status);
  const bcv = rates.bcv?.rate ?? Number(order.bcvRate);
  const status = ORDER_STATUS[order.status];
  const left = order.reservedUntil && order.status === "PENDING" ? timeLeft(order.reservedUntil) : null;

  // Cuentas de cada método: las de su tipo principal (p. ej. Pago Móvil), y si no hay, las compatibles.
  const accountsFor = (m: PaymentMethod) => {
    const types = PAYMENT_METHODS[m].accountTypes;
    const primary = accounts.filter((a) => a.type === types[0]);
    return (primary.length ? primary : accounts.filter((a) => types.includes(a.type))) as CheckoutAccount[];
  };
  const methods = (Object.keys(PAYMENT_METHODS) as PaymentMethod[])
    .filter((m) => PAYMENT_METHODS[m].online)
    .map((m) => ({
      method: m,
      label: PAYMENT_METHODS[m].label,
      icon: PAYMENT_METHODS[m].icon,
      currency: PAYMENT_METHODS[m].currency,
      accounts: accountsFor(m),
    }))
    .filter((m) => m.accounts.length);

  const waText = `¡Hola ${tenant.name}! Te escribo por mi pedido #${order.number}.`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Pedido #{order.number}</p>
      <h1 className="font-display text-4xl font-semibold">{status.customer}</h1>
      <p className="mt-1 text-sm text-store-muted">
        Hola {order.customerName.split(" ")[0]}, guarda este enlace para ver el estado de tu pedido en cualquier momento.
      </p>

      {order.status !== "CANCELLED" ? (
        <ol className="mt-6 grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
          {customerSteps(order.status, order.fulfillment).map((s) => (
            <li key={s.key} className="flex flex-col items-center gap-1.5">
              <span className={cn("h-1.5 w-full rounded-full", s.done ? "bg-brand" : "bg-store-line")} />
              <span className={cn(s.done ? "font-semibold" : "text-store-muted")}>{s.label}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 rounded-2xl bg-danger/10 p-4 text-sm text-danger">
          Este pedido fue anulado{order.cancelReason ? `: ${order.cancelReason}` : ""}. Si crees que es un error, escríbenos.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {unpaid ? (
            <section className="rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold">Paga tu pedido</h2>
                {left ? <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Apartado por {left} más</span> : null}
              </div>
              {order.status === "PAYMENT_REVIEW" ? (
                <p className="mt-3 rounded-xl bg-store-soft p-3 text-sm">
                  ✅ Recibimos tu reporte de pago. Lo verificamos en la cuenta y te avisamos por WhatsApp.
                  {remaining > 0 ? " Si pagaste en partes, reporta aquí el resto." : ""}
                </p>
              ) : null}
              {remaining > 0 ? (
                methods.length ? (
                  <PaymentReport token={order.trackingToken} methods={methods} remainingUsdCents={remaining} bcvRate={bcv} />
                ) : (
                  <p className="mt-3 text-sm text-store-muted">Escríbenos por WhatsApp para recibir los datos de pago.</p>
                )
              ) : null}
            </section>
          ) : null}

          {order.payments.length ? (
            <section className="rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
              <h2 className="font-display text-xl font-semibold">Pagos</h2>
              <ul className="mt-3 divide-y divide-store-line text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>
                      {PAYMENT_METHODS[p.method].label} · {formatMoney(toCents(p.amount), p.currency)}
                      {p.reference ? <span className="text-store-muted"> · ref. {p.reference}</span> : null}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        p.status === "CONFIRMED" ? "bg-ok/15 text-ok" : p.status === "REJECTED" ? "bg-danger/10 text-danger" : "bg-store-soft",
                      )}
                    >
                      {PAYMENT_STATUS_LABEL[p.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-3xl bg-store-card p-5 text-sm shadow-sm sm:p-6">
            <h2 className="font-display text-xl font-semibold">
              {FULFILLMENT[order.fulfillment].icon} {FULFILLMENT[order.fulfillment].label}
            </h2>
            {order.fulfillment === "NATIONAL_SHIPPING" ? (
              <p className="mt-2">
                {[order.carrier, order.carrierOffice].filter(Boolean).join(" · ")}
                <br />
                {[order.shippingAddress, order.shippingCity, order.shippingState].filter(Boolean).join(", ")}
                {order.trackingNumber ? (
                  <span className="mt-2 block font-semibold">Número de guía: {order.trackingNumber}</span>
                ) : null}
              </p>
            ) : order.fulfillment === "LOCAL_DELIVERY" ? (
              <p className="mt-2">{[order.shippingAddress, order.shippingRef, order.shippingCity].filter(Boolean).join(" · ")}</p>
            ) : (
              <p className="mt-2 text-store-muted">Te avisamos por WhatsApp cuando esté listo para retirar.</p>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-xl font-semibold">Resumen</h2>
          <ul className="mt-3 divide-y divide-store-line">
            {order.items.map((it) => (
              <li key={it.id} className="flex gap-3 py-3 text-sm">
                {it.product?.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={it.product.images[0].url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.productName}</p>
                  <p className="text-xs text-store-muted">{[it.sizeLabel && `Talla ${it.sizeLabel}`, it.colorName, `${it.quantity} ud.`].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="font-semibold">{formatUsd(toCents(it.lineTotalUsd))}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-store-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatUsd(toCents(order.subtotalUsd))}</dd></div>
            <div className="flex justify-between">
              <dt>Envío</dt>
              <dd>{toCents(order.shippingUsd) > 0 ? formatUsd(toCents(order.shippingUsd)) : order.fulfillment === "NATIONAL_SHIPPING" ? "Cobro a destino" : order.fulfillment === "PICKUP" ? "—" : "Gratis"}</dd>
            </div>
            {toCents(order.ivaUsd) > 0 ? (
              <div className="flex justify-between text-store-muted"><dt>IVA{toCents(order.totalUsd) === toCents(order.subtotalUsd) + toCents(order.shippingUsd) ? " incluido" : ""}</dt><dd>{formatUsd(toCents(order.ivaUsd))}</dd></div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-store-line pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-right">
                <span className="block font-display text-2xl font-semibold">{formatUsd(totalCents)}</span>
                {unpaid ? (
                  <span className="text-xs text-store-muted">{formatVes(usdToVesCents(totalCents, bcv))} a la tasa BCV de hoy</span>
                ) : (
                  <span className="text-xs text-store-muted">{formatVes(toCents(order.totalVes))}</span>
                )}
              </dd>
            </div>
            {confirmed > 0 && confirmed < totalCents ? (
              <div className="flex justify-between font-semibold text-ok"><dt>Pagado</dt><dd>{formatUsd(confirmed)}</dd></div>
            ) : null}
          </dl>
          {tenant.contactPhone ? (
            <a
              href={whatsappLink(tenant.contactPhone, waText)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 block rounded-full border-2 border-store-ink px-4 py-2.5 text-center text-sm font-semibold hover:bg-store-ink hover:text-on-store-ink"
            >
              💬 Escribir por WhatsApp · {formatVePhone(tenant.contactPhone)}
            </a>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

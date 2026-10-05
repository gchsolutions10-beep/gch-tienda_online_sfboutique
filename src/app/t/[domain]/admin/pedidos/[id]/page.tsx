import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { OrderStatusBadge, PaymentStatusText } from "@/components/admin/order-badges";
import { OrderActions, PaymentReview } from "@/components/admin/order-actions";
import { card, cn } from "@/components/ui/styles";
import { formatMoney, formatRate, formatUsd, formatVes, toCents } from "@/lib/money";
import { CARRIERS, FULFILLMENT, nextStatus, NEXT_ACTION, ORDER_STATUS, timeLeft } from "@/lib/orders";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
import { formatVeId, formatVePhone, whatsappLink } from "@/lib/ve-ids";

export const metadata = { title: "Pedido" };

const PAYMENT_STATUS = {
  PENDING_REVIEW: ["Por verificar", "bg-amber-100 text-amber-900"],
  CONFIRMED: ["Confirmado", "bg-emerald-100 text-emerald-900"],
  REJECTED: ["Rechazado", "bg-red-100 text-red-900"],
  REFUNDED: ["Reembolsado", "bg-cream text-muted"],
} as const;

export default async function OrderDetailPage({ params }: PageProps<"/t/[domain]/admin/pedidos/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, CASHIER_ROLES, `/admin/pedidos/${id}`);
  const tdb = tenantDb(tenant.id);
  const order = await tdb.order.findFirst({
    where: { id },
    include: {
      items: { include: { product: { select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } } },
      payments: { orderBy: { createdAt: "asc" }, include: { financialAccount: { select: { name: true } }, reviewedBy: { select: { name: true, email: true } } } },
      events: { orderBy: { createdAt: "desc" } },
      customer: { select: { id: true, ordersCount: true, totalSpentUsd: true } },
    },
  });
  if (!order) notFound();
  const [accounts, rates] = await Promise.all([
    tdb.financialAccount.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true, currency: true } }),
    getCurrentRates(tenant.id),
  ]);

  const total = toCents(order.totalUsd);
  const paid = toCents(order.paidUsd);
  const remaining = Math.max(0, total - paid);
  const next = nextStatus(order.status, order.fulfillment);
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });
  const waText = `¡Hola ${order.customerName.split(" ")[0]}! Te escribimos de ${tenant.name} por tu pedido #${order.number}.`;
  const left = order.status === "PENDING" && order.reservedUntil ? timeLeft(order.reservedUntil) : null;

  return (
    <>
      <Link href="/admin/pedidos" className="text-sm font-semibold text-muted hover:text-ink">
        ← Pedidos
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold">Pedido #{order.number}</h1>
        <OrderStatusBadge status={order.status} className="text-sm" />
        <PaymentStatusText status={order.paymentStatus} />
        {left ? <span className="text-xs text-muted">Stock apartado {left} más</span> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Pagos */}
          <section className={cn(card, "p-5")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">Pagos</h2>
              <p className="text-sm">
                Pagado <b>{formatUsd(paid)}</b> de {formatUsd(total)}
                {remaining > 0 && order.status !== "CANCELLED" ? <span className="text-amber-800"> · falta {formatUsd(remaining)}</span> : null}
              </p>
            </div>
            {order.payments.length === 0 ? <p className="mt-3 text-sm text-muted">La clienta aún no reporta pagos.</p> : null}
            <ul className="mt-3 space-y-3">
              {order.payments.map((p) => (
                <li key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm">
                      <p className="font-semibold">
                        {PAYMENT_METHODS[p.method].icon} {PAYMENT_METHODS[p.method].label} · {formatMoney(toCents(p.amount), p.currency)}
                        {p.currency === "VES" ? <span className="font-normal text-muted"> ≈ {formatUsd(toCents(p.amountUsd))} a {formatRate(Number(p.rate))}</span> : null}
                      </p>
                      <p className="text-xs text-muted">
                        {[
                          p.financialAccount?.name && `A: ${p.financialAccount.name}`,
                          p.reference && `Ref. ${p.reference}`,
                          p.payerBank,
                          p.payerPhone,
                          p.payerIdNumber && `C.I. ${p.payerIdNumber}`,
                          p.payerName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-xs text-muted">
                        {fmt(p.createdAt)}
                        {p.reviewedAt ? ` · revisado por ${p.reviewedBy?.name ?? p.reviewedBy?.email ?? "—"}` : ""}
                        {p.reviewNote ? ` · ${p.reviewNote}` : ""}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PAYMENT_STATUS[p.status][1])}>{PAYMENT_STATUS[p.status][0]}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p.proofKey ? (
                      <a href={`/admin/pedidos/comprobante/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-strong underline">
                        Ver comprobante
                      </a>
                    ) : null}
                    {p.status === "PENDING_REVIEW" ? <PaymentReview paymentId={p.id} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Artículos */}
          <section className={cn(card, "p-5")}>
            <h2 className="text-lg font-bold">Artículos</h2>
            <ul className="mt-3 divide-y divide-line">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2.5">
                  {it.product?.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura
                    <img src={it.product.images[0].url} alt="" className="h-14 w-11 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="h-14 w-11 shrink-0 rounded-md bg-cream" />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{it.productName}</p>
                    <p className="text-xs text-muted">{[it.sizeLabel && `Talla ${it.sizeLabel}`, it.colorName, it.sku].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="text-sm">
                    {it.quantity} × {formatUsd(toCents(it.unitPriceUsd))}
                  </span>
                  <span className="w-20 text-right text-sm font-semibold">{formatUsd(toCents(it.lineTotalUsd))}</span>
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-3 max-w-xs space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatUsd(toCents(order.subtotalUsd))}</dd></div>
              {toCents(order.exemptUsd) > 0 ? <div className="flex justify-between text-muted"><dt>Exento</dt><dd>{formatUsd(toCents(order.exemptUsd))}</dd></div> : null}
              <div className="flex justify-between text-muted"><dt>Base imponible</dt><dd>{formatUsd(toCents(order.taxableUsd))}</dd></div>
              <div className="flex justify-between text-muted"><dt>IVA {Math.round(Number(order.ivaRate) * 100)} %</dt><dd>{formatUsd(toCents(order.ivaUsd))}</dd></div>
              <div className="flex justify-between"><dt>Envío</dt><dd>{formatUsd(toCents(order.shippingUsd))}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Total</dt><dd>{formatUsd(total)}</dd></div>
              <div className="flex justify-between text-xs text-muted">
                <dt>En Bs (BCV {formatRate(Number(order.bcvRate))})</dt>
                <dd>{formatVes(toCents(order.totalVes))}</dd>
              </div>
            </dl>
          </section>

          {/* Historial */}
          <section className={cn(card, "p-5")}>
            <h2 className="text-lg font-bold">Historial</h2>
            <ol className="mt-3 space-y-2 border-l-2 border-line pl-4 text-sm">
              {order.events.map((e) => (
                <li key={e.id}>
                  <p>
                    {e.toStatus ? <b>{ORDER_STATUS[e.toStatus].label}</b> : null}
                    {e.toStatus && e.note ? " · " : null}
                    {e.note}
                  </p>
                  <p className="text-xs text-muted">
                    {fmt(e.createdAt)}
                    {e.userName ? ` · ${e.userName}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <OrderActions
            orderId={order.id}
            status={order.status}
            next={next ? { status: next, label: NEXT_ACTION[next]! } : null}
            carrier={order.carrier}
            carriers={[...CARRIERS]}
            remainingUsdCents={remaining}
            bcvRate={rates.bcv?.rate ?? Number(order.bcvRate)}
            accounts={accounts}
            methods={(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => ({ method: m, label: PAYMENT_METHODS[m].label, currency: PAYMENT_METHODS[m].currency, accountTypes: PAYMENT_METHODS[m].accountTypes }))}
            internalNote={order.internalNote}
          />

          <section className={cn(card, "p-5 text-sm")}>
            <h2 className="text-lg font-bold">Clienta</h2>
            <p className="mt-2 font-semibold">{order.customerName}</p>
            {order.customerIdNumber ? <p className="text-muted">{formatVeId(order.customerIdType, order.customerIdNumber)}</p> : null}
            {order.customerPhone ? (
              <a href={whatsappLink(order.customerPhone, waText)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-ok underline">
                WhatsApp {formatVePhone(order.customerPhone)}
              </a>
            ) : null}
            {order.customerEmail ? <p className="text-muted">{order.customerEmail}</p> : null}
            {order.customer && order.customer.ordersCount > 0 ? (
              <p className="mt-2 text-xs text-muted">
                {order.customer.ordersCount} {order.customer.ordersCount === 1 ? "compra pagada" : "compras pagadas"} · {formatUsd(toCents(order.customer.totalSpentUsd))} en total
              </p>
            ) : null}
            {order.notes ? <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-950">📝 {order.notes}</p> : null}
          </section>

          <section className={cn(card, "p-5 text-sm")}>
            <h2 className="text-lg font-bold">
              {FULFILLMENT[order.fulfillment].icon} {FULFILLMENT[order.fulfillment].label}
            </h2>
            {order.fulfillment === "PICKUP" ? (
              <p className="mt-2 text-muted">La clienta retira en la tienda.</p>
            ) : (
              <div className="mt-2 space-y-0.5">
                {order.carrier ? <p><b>{order.carrier}</b>{order.carrierOffice ? ` · ${order.carrierOffice}` : ""}</p> : null}
                <p>{order.shippingAddress}</p>
                <p className="text-muted">{[order.shippingRef, order.shippingCity, order.shippingState].filter(Boolean).join(" · ")}</p>
                {order.trackingNumber ? <p className="mt-1 font-semibold">Guía: {order.trackingNumber}</p> : null}
              </div>
            )}
          </section>
          <p className="text-xs text-muted">
            Creado el {fmt(order.createdAt)} · canal {order.channel === "WEB" ? "tienda web" : order.channel.toLowerCase()}
          </p>
        </div>
      </div>
    </>
  );
}

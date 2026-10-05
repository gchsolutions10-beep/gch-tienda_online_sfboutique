import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { requireAdmin } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { PageHeader } from "@/components/admin/page-header";
import { card, cn } from "@/components/ui/styles";
import { formatRate, formatUsd, formatVes, toCents, usdToVesCents } from "@/lib/money";
import { isStale, percent, spread } from "@/lib/rates";

export const metadata = { title: "Resumen" };

export default async function AdminHome({ params }: PageProps<"/t/[domain]/admin">) {
  const tenant = await getTenant((await params).domain);
  await requireAdmin(tenant);
  const tdb = tenantDb(tenant.id);
  // Desde la medianoche de hoy en Caracas (UTC−4).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  const startOfDay = new Date(`${today}T00:00:00-04:00`);
  const [rates, products, variants, customers, posts, orderCounts, sales] = await Promise.all([
    getCurrentRates(tenant.id),
    tdb.product.count({ where: { isActive: true } }),
    tdb.productVariant.findMany({ where: { isActive: true, product: { isActive: true } }, select: { stock: true, reserved: true, priceUsdOverride: true, product: { select: { priceUsd: true, costUsd: true } } } }),
    tdb.customer.count(),
    tdb.blogPost.count({ where: { status: "PUBLISHED" } }),
    tdb.order.groupBy({ by: ["status"], where: { status: { in: ["PAYMENT_REVIEW", "PENDING", "PAID", "PREPARING"] } }, _count: { _all: true } }),
    tdb.order.groupBy({
      by: ["channel"],
      where: { paidAt: { gte: startOfDay }, status: { not: "CANCELLED" } },
      _sum: { totalUsd: true, totalVes: true },
      _count: { _all: true },
    }),
  ]);
  const salesUsd = sales.reduce((a, s) => a + toCents(s._sum.totalUsd ?? 0), 0);
  const salesVes = sales.reduce((a, s) => a + toCents(s._sum.totalVes ?? 0), 0);
  const salesBy = (channel: string) => sales.find((s) => s.channel === channel);
  const countOf = (...statuses: string[]) => orderCounts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c._count._all, 0);
  const todo = [
    { n: countOf("PAYMENT_REVIEW"), label: "pagos por verificar", href: "/admin/pedidos?estado=verificar", urgent: true },
    { n: countOf("PAID", "PREPARING"), label: "pedidos por preparar", href: "/admin/pedidos?estado=preparar", urgent: false },
    { n: countOf("PENDING"), label: "esperando pago", href: "/admin/pedidos?estado=cobrar", urgent: false },
  ].filter((t) => t.n > 0);

  const units = variants.reduce((a, v) => a + v.stock, 0);
  const soldOut = variants.filter((v) => v.stock - v.reserved <= 0).length;
  const retailCents = variants.reduce((a, v) => a + v.stock * toCents(v.priceUsdOverride ?? v.product.priceUsd), 0);
  const costCents = variants.reduce((a, v) => a + v.stock * toCents(v.product.costUsd ?? 0), 0);
  const bcv = rates.bcv?.rate ?? null;

  const tiles = [
    { label: "Productos activos", value: String(products) },
    { label: "Variantes (talla × color)", value: String(variants.length), hint: `${soldOut} agotadas` },
    { label: "Unidades en inventario", value: String(units) },
    { label: "Clientes en el CRM", value: String(customers) },
  ];

  return (
    <>
      <PageHeader title="Hola 👋" description={`Panel de ${tenant.name}`} />

      {todo.length ? (
        <section aria-label="Pendientes" className="mb-6 flex flex-wrap gap-3">
          {todo.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(card, "flex items-center gap-3 px-4 py-3 transition hover:border-brand", t.urgent && "border-amber-300 bg-amber-50")}
            >
              <span className="font-display text-2xl font-bold">{t.n}</span>
              <span className="text-sm font-semibold">{t.label} →</span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className={cn(card, "mb-6 flex flex-wrap items-end justify-between gap-4 p-5")}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Ventas de hoy</p>
          <p className="font-display text-4xl font-semibold">{formatUsd(salesUsd)}</p>
          <p className="text-sm text-muted">{formatVes(salesVes)} en libros (tasa BCV de cada venta)</p>
          <Link href="/admin/reportes?periodo=mes" className="mt-1 inline-block text-sm font-semibold text-brand-strong underline">
            Ver reportes del mes →
          </Link>
        </div>
        <dl className="flex gap-6 text-sm">
          {[
            ["Tienda física", salesBy("STORE")],
            ["Tienda web", salesBy("WEB")],
          ].map(([label, s]) => {
            const row = s as (typeof sales)[number] | undefined;
            return (
              <div key={label as string}>
                <dt className="text-xs font-semibold text-muted">{label as string}</dt>
                <dd className="font-bold">{formatUsd(toCents(row?._sum.totalUsd ?? 0))}</dd>
                <dd className="text-xs text-muted">{row?._count._all ?? 0} ventas</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        {(["bcv", "p2p"] as const).map((k) => {
          const r = rates[k];
          const stale = r ? isStale(new Date(r.effectiveAt)) : true;
          return (
            <Link key={k} href="/admin/tasas" className={cn(card, "block p-5 transition hover:border-brand", stale && "border-amber-300 bg-amber-50")}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Tasa {k.toUpperCase()}</p>
              <p className="mt-1 font-display text-3xl font-semibold">{r ? formatRate(r.rate) : "Sin tasa"}</p>
              <p className={cn("mt-1 text-xs", stale ? "font-semibold text-amber-900" : "text-muted")}>
                {r
                  ? `${stale ? "⚠️ Actualízala · " : ""}desde ${new Date(r.effectiveAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" })}`
                  : "Cárgala para mostrar precios en bolívares"}
              </p>
            </Link>
          );
        })}
      </section>
      {rates.bcv && rates.p2p ? (
        <p className="-mt-3 mb-6 text-sm text-muted">
          Brecha P2P vs BCV: <b className="text-ink">{percent(spread(rates.bcv.rate, rates.p2p.rate))}</b>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={cn(card, "p-5")}>
            <p className="text-xs font-semibold text-muted">{t.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold">{t.value}</p>
            {t.hint ? <p className="text-xs text-muted">{t.hint}</p> : null}
          </div>
        ))}
      </div>

      <section className={cn(card, "mt-6 p-5")}>
        <h2 className="font-display text-xl font-semibold">Valor del inventario</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted">A precio de venta</dt>
            <dd className="font-display text-2xl font-semibold">{formatUsd(retailCents)}</dd>
            {bcv ? <dd className="text-sm text-muted">{formatVes(usdToVesCents(retailCents, bcv))} a tasa BCV</dd> : null}
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">A costo</dt>
            <dd className="font-display text-2xl font-semibold">{formatUsd(costCents)}</dd>
            {bcv ? <dd className="text-sm text-muted">{formatVes(usdToVesCents(costCents, bcv))} a tasa BCV</dd> : null}
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">{posts} artículo(s) publicados en el blog.</p>
      </section>
    </>
  );
}

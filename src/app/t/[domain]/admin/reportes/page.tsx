import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { getInventoryReport, getReport } from "@/server/queries/reports";
import { PageHeader } from "@/components/admin/page-header";
import { SalesChart } from "@/components/admin/sales-chart";
import { buttonSecondary, card, cn, inputBase } from "@/components/ui/styles";
import { change, PERIODS, periodRange, type Ranked } from "@/lib/reports";
import { formatMoney, formatUsd, formatVes } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/payments";

export const metadata = { title: "Reportes" };

/** Reportes: la dueña ve todo (incluidos costos y márgenes); la encargada, ventas. */
const REPORT_ROLES = ["TENANT_ADMIN", "BRANCH_ADMIN"] as const;

const pct = (x: number) => `${(x * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })} %`;

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted">sin datos para comparar</span>;
  const up = value >= 0;
  return (
    <span className={cn("text-xs font-semibold", up ? "text-ok" : "text-danger")}>
      {up ? "▲" : "▼"} {pct(Math.abs(value))} <span className="font-normal text-muted">vs. periodo anterior</span>
    </span>
  );
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/t/[domain]/admin/reportes">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireStaff(tenant, [...REPORT_ROLES], "/admin/reportes");
  const owner = isTenantAdmin(ctx);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = periodRange(str("periodo"), new Date(), { desde: str("desde"), hasta: str("hasta") });
  const [r, inv] = await Promise.all([getReport(tenant.id, range), owner ? getInventoryReport(tenant.id) : null]);
  const query = range.key === "rango" ? `periodo=rango&desde=${str("desde")}&hasta=${str("hasta")}` : `periodo=${range.key}`;
  const fmt = (d: Date) => d.toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Caracas" });

  const tiles = [
    { label: "Ventas", value: formatUsd(r.salesCents), extra: <Delta value={change(r.salesCents, r.previous.salesCents)} /> },
    { label: "Pedidos pagados", value: String(r.orders), extra: <Delta value={change(r.orders, r.previous.orders)} /> },
    { label: "Ticket promedio", value: formatUsd(r.avgTicketCents), extra: <span className="text-xs text-muted">{r.units} prendas vendidas</span> },
    owner
      ? {
          label: "Utilidad bruta",
          value: formatUsd(r.margin.profitCents),
          extra: <span className="text-xs text-muted">{r.margin.margin === null ? "sin costos cargados" : `margen ${pct(r.margin.margin)} sobre la venta sin IVA`}</span>,
        }
      : { label: "Clientas nuevas", value: String(r.customers.new), extra: <span className="text-xs text-muted">primera compra en el periodo</span> },
  ];

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Ventas, márgenes y el valor real de lo cobrado en bolívares. Montos en USD salvo que diga Bs."
        actions={<a href={`/admin/reportes/exportar?${query}`} className={buttonSecondary}>⬇️ Ventas en Excel (CSV)</a>}
      />

      <nav aria-label="Periodo" className="mb-3 flex flex-wrap gap-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/reportes?periodo=${p.key}`}
            aria-current={range.key === p.key ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", range.key === p.key ? "bg-ink text-white" : "bg-paper hover:bg-line")}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <form action="/admin/reportes" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="periodo" value="rango" />
        <label htmlFor="desde" className="text-muted">Desde</label>
        <input id="desde" name="desde" type="date" required defaultValue={str("desde")} className={inputBase} />
        <label htmlFor="hasta" className="text-muted">hasta</label>
        <input id="hasta" name="hasta" type="date" required defaultValue={str("hasta")} className={inputBase} />
        <button className={buttonSecondary}>Ver</button>
        <span className="text-muted">· {range.label}</span>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={cn(card, "p-4")}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.label}</p>
            <p className="font-display text-3xl font-semibold">{t.value}</p>
            {t.extra}
          </div>
        ))}
      </div>

      {r.orders === 0 ? (
        <p className={cn(card, "p-10 text-center text-sm text-muted")}>No hay ventas pagadas en este periodo.</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {r.daily.length > 1 ? (
            <section className={cn(card, "p-5 xl:col-span-2")}>
              <h2 className="mb-3 font-bold">Ventas por día</h2>
              <SalesChart days={r.daily} />
            </section>
          ) : null}

          <section className={cn(card, "p-5")}>
            <h2 className="font-bold">Por canal</h2>
            <Table
              head={["Canal", "Pedidos", "Ventas", "%"]}
              rows={r.byChannel.map((c) => [c.channel === "WEB" ? "🛒 Tienda en línea" : "🏬 Tienda física", String(c.count), formatUsd(c.cents), r.salesCents ? pct(c.cents / r.salesCents) : "—"])}
            />
            <h3 className="mt-5 font-bold">Cómo pagaron</h3>
            <Table
              head={["Método", "Pagos", "Monto", "Equiv. USD"]}
              rows={r.byMethod.map((m) => [`${PAYMENT_METHODS[m.method].icon} ${PAYMENT_METHODS[m.method].label}`, String(m.count), formatMoney(m.amount, m.currency), formatUsd(m.usd)])}
            />
          </section>

          <section className={cn(card, "p-5")}>
            <h2 className="font-bold">Lo cobrado en bolívares, ¿cuánto vale de verdad?</h2>
            {r.ves.vesCents ? (
              <>
                <p className="mt-1 text-sm text-muted">Los libros usan la tasa BCV; para comprar divisas se usa la P2P. Comparamos con la tasa de cada día de pago.</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Cobrado en Bs" value={formatVes(r.ves.vesCents)} />
                  <Row label="Vale a tasa BCV (libros)" value={formatUsd(r.ves.atBcvUsd)} />
                  <Row label="Vale a tasa P2P (mercado)" value={formatUsd(r.ves.atP2pUsd)} />
                  <div className={cn("flex justify-between rounded-lg p-2 font-bold", r.ves.differenceUsd < 0 ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900")}>
                    <dt>{r.ves.differenceUsd < 0 ? "Pérdida cambiaria" : "Ganancia cambiaria"}</dt>
                    <dd>{formatUsd(Math.abs(r.ves.differenceUsd))}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted">
                  Consejo: convierte a divisas los bolívares cobrados lo antes posible o ajusta precios si la brecha crece.
                  {r.ves.withoutP2p ? ` ${r.ves.withoutP2p} pago(s) quedaron fuera porque ese día no había tasa P2P cargada.` : ""}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {r.ves.withoutP2p ? "Carga la tasa P2P en «Tasas BCV / P2P» para ver esta comparación." : "No hubo cobros en bolívares en este periodo."}
              </p>
            )}

            <h3 className="mt-5 font-bold">Impuestos y otros</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="IVA cobrado (equiv. USD)" value={formatUsd(r.taxes.ivaCents)} />
              <Row label="IGTF cobrado" value={formatUsd(r.taxes.igtfCents)} />
              <Row label="Descuentos dados" value={formatUsd(r.taxes.discountCents)} />
              <Row label="Envíos cobrados" value={formatUsd(r.taxes.shippingCents)} />
              {r.cancelled.count ? <Row label={`Pedidos pagados anulados (${r.cancelled.count})`} value={formatUsd(r.cancelled.cents)} /> : null}
            </dl>
            <p className="mt-2 text-xs text-muted">Para declarar usa el libro de ventas (Facturación), que está en Bs a la tasa de cada factura.</p>
          </section>

          <section className={cn(card, "p-5 xl:col-span-2")}>
            <h2 className="font-bold">Lo más vendido</h2>
            {owner && r.margin.withoutCost ? (
              <p className="mt-1 text-xs text-amber-800">
                {r.margin.withoutCost} prenda(s) vendida(s) no tienen costo cargado: no cuentan en la utilidad. Cárgalo en Productos.
              </p>
            ) : null}
            <RankTable rows={r.topProducts} owner={owner} first="Producto" />
          </section>

          <section className={cn(card, "p-5")}>
            <h2 className="font-bold">Por categoría</h2>
            <RankTable rows={r.byCategory} owner={owner} first="Categoría" />
          </section>
          <section className={cn(card, "p-5")}>
            <h2 className="font-bold">Tallas y colores</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <RankTable rows={r.bySize} owner={false} first="Talla" compact />
              <RankTable rows={r.byColor} owner={false} first="Color" compact />
            </div>
            <p className="mt-2 text-xs text-muted">Úsalo para comprar: repón primero las tallas y colores que más salen.</p>
          </section>

          <section className={cn(card, "p-5")}>
            <h2 className="font-bold">Clientas</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="Clientas nuevas (primera compra)" value={String(r.customers.new)} />
              <Row label="Pedidos de clientas que ya habían comprado" value={`${r.customers.returningOrders} de ${r.customers.identifiedOrders}`} />
            </dl>
            <Link href="/admin/clientes" className="mt-3 inline-block text-sm font-semibold text-brand-strong underline">Ver el CRM →</Link>
          </section>
        </div>
      )}

      {inv ? (
        <section className={cn(card, "mt-6 p-5")}>
          <h2 className="font-bold">Inventario hoy</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Unidades en stock" value={String(inv.units)} />
            <Stat label="Valor a precio de venta" value={formatUsd(inv.retailCents)} />
            <Stat label="Valor al costo" value={formatUsd(inv.costCents)} hint={inv.withoutCost ? `${inv.withoutCost} producto(s) con stock sin costo` : undefined} />
          </div>
          {inv.slow.length ? (
            <>
              <h3 className="mt-5 font-bold">Prendas que no se mueven (60 días o más sin venderse)</h3>
              <Table
                head={["Producto", "Categoría", "Stock", "Última venta"]}
                rows={inv.slow.map((s) => [s.name, s.category, String(s.stock), s.lastSoldAt ? fmt(s.lastSoldAt) : "nunca"])}
              />
              <p className="mt-2 text-xs text-muted">Idea: ponlas en oferta, combínalas en un look del blog o muévelas a la vitrina.</p>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-cream p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-amber-800">{hint}</p> : null}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("py-1.5 font-semibold", i > 0 && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("py-1.5", j > 0 && "text-right tabular-nums")}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranking con una barrita de proporción (gris, texto en tinta normal). */
function RankTable({ rows, owner, first, compact }: { rows: Ranked[]; owner: boolean; first: string; compact?: boolean }) {
  if (!rows.length) return <p className="mt-2 text-sm text-muted">Sin datos.</p>;
  const max = rows[0].baseCents || 1;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="py-1.5 font-semibold">{first}</th>
            <th className="py-1.5 text-right font-semibold">Uds.</th>
            <th className="py-1.5 text-right font-semibold">{compact ? "Venta" : "Venta sin IVA"}</th>
            {owner ? <th className="py-1.5 text-right font-semibold">Utilidad</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5 pr-2">
                <span className="block">{r.label}</span>
                <span className="mt-1 block h-1 rounded-full bg-brand/70" style={{ width: `${Math.max(3, (r.baseCents / max) * 100)}%` }} aria-hidden />
              </td>
              <td className="py-1.5 text-right tabular-nums">{r.quantity}</td>
              <td className="py-1.5 text-right tabular-nums">{formatUsd(r.baseCents)}</td>
              {owner ? <td className="py-1.5 text-right tabular-nums">{r.profitCents === null ? "—" : formatUsd(r.profitCents)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

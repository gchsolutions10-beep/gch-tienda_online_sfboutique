import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { PageHeader } from "@/components/admin/page-header";
import { RateForm } from "@/components/admin/rate-form";
import { card, cn } from "@/components/ui/styles";
import { formatRate } from "@/lib/money";
import { isStale, percent, rateChange, spread } from "@/lib/rates";

export const metadata = { title: "Tasas de cambio" };

export default async function RatesPage({ params }: PageProps<"/t/[domain]/admin/tasas">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], "/admin/tasas");
  const tdb = tenantDb(tenant.id);
  const [current, history] = await Promise.all([
    getCurrentRates(tenant.id),
    tdb.exchangeRate.findMany({
      orderBy: { effectiveAt: "desc" },
      take: 60,
      select: { id: true, source: true, rate: true, effectiveAt: true, note: true, createdBy: { select: { name: true, email: true } } },
    }),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  // Cambio respecto a la anterior de la misma fuente.
  const rows = history.map((h, i) => {
    const prev = history.slice(i + 1).find((x) => x.source === h.source);
    return { ...h, rate: Number(h.rate), change: prev ? rateChange(Number(prev.rate), Number(h.rate)) : null };
  });
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });

  return (
    <>
      <PageHeader
        title="Tasas de cambio"
        description="Bolívares por dólar. La BCV es la oficial (factura y libros); la P2P es para tu control de gestión. Cada carga queda en el histórico."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(["bcv", "p2p"] as const).map((k) => {
          const r = current[k];
          const stale = r ? isStale(new Date(r.effectiveAt)) : true;
          return (
            <div key={k} className={cn(card, "p-5", stale && "border-amber-300 bg-amber-50")}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Vigente {k.toUpperCase()}</p>
              <p className="mt-1 font-display text-3xl font-semibold">{r ? formatRate(r.rate) : "—"}</p>
              <p className="text-xs text-muted">{r ? `desde ${fmt(new Date(r.effectiveAt))}` : "Sin cargar"}</p>
              {stale ? <p className="mt-1 text-xs font-semibold text-amber-900">⚠️ Tiene más de 24 horas</p> : null}
            </div>
          );
        })}
        <div className={cn(card, "p-5")}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Brecha P2P / BCV</p>
          <p className="mt-1 font-display text-3xl font-semibold">{current.bcv && current.p2p ? percent(spread(current.bcv.rate, current.p2p.rate)) : "—"}</p>
          <p className="text-xs text-muted">Cuánto más vale el dólar en el mercado</p>
        </div>
      </div>

      <RateForm today={today} />

      <section className={cn(card, "mt-6 overflow-hidden")}>
        <h2 className="border-b border-line px-5 py-3 font-display text-lg font-semibold">Histórico</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-2">Rige desde</th>
                <th className="px-5 py-2">Tipo</th>
                <th className="px-5 py-2 text-right">Tasa</th>
                <th className="px-5 py-2 text-right">Cambio</th>
                <th className="px-5 py-2">Cargada por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-5 py-2">{fmt(r.effectiveAt)}</td>
                  <td className="px-5 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", r.source === "BCV" ? "bg-brand-soft text-brand-strong" : "bg-cream text-ink")}>{r.source}</span>
                  </td>
                  <td className="px-5 py-2 text-right font-semibold">{formatRate(r.rate)}</td>
                  <td className={cn("px-5 py-2 text-right", r.change && r.change > 0 ? "text-danger" : "text-ok")}>{r.change === null ? "—" : percent(r.change)}</td>
                  <td className="px-5 py-2 text-xs text-muted">
                    {r.createdBy?.name ?? r.createdBy?.email ?? "—"}
                    {r.note ? ` · ${r.note}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

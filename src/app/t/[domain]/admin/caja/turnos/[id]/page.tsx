import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { parseFloat_, sessionSummary } from "@/server/services/cash";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { card, cn } from "@/components/ui/styles";
import { formatMoney, formatUsd, formatVes, toCents, type Currency } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/payments";

export const metadata = { title: "Cierre de caja" };

export default async function SessionReportPage({ params }: PageProps<"/t/[domain]/admin/caja/turnos/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, CASHIER_ROLES, `/admin/caja/turnos/${id}`);
  const summary = await sessionSummary(tenant.id, id);
  if (!summary) notFound();
  const s = summary.session;
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });
  const float = parseFloat_(s.openingFloat);

  // Cobros por método, en su moneda original.
  const byMethod = new Map<string, { label: string; currency: Currency; cents: number; n: number }>();
  for (const p of s.payments) {
    const k = `${p.method}-${p.currency}`;
    const row = byMethod.get(k) ?? { label: PAYMENT_METHODS[p.method].label, currency: p.currency, cents: 0, n: 0 };
    row.cents += toCents(p.amount);
    row.n += 1;
    byMethod.set(k, row);
  }

  return (
    <>
      <Link href="/admin/caja/turnos" className="text-sm font-semibold text-muted hover:text-ink print:hidden">
        ← Turnos
      </Link>
      <PageHeader
        title={`Cierre · ${s.register.name}`}
        description={`${fmt(s.openedAt)} → ${s.closedAt ? fmt(s.closedAt) : "abierto"} · abrió ${s.openedBy.name ?? s.openedBy.email}${s.closedBy ? ` · cerró ${s.closedBy.name ?? s.closedBy.email}` : ""}`}
        actions={<PrintButton />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn(card, "p-5")}>
          <p className="text-xs font-semibold text-muted">Ventas</p>
          <p className="font-display text-3xl font-bold">{formatUsd(summary.salesUsd)}</p>
          <p className="text-sm text-muted">
            {formatVes(summary.salesVes)} · {s.orders.length} ventas
          </p>
        </div>
        <div className={cn(card, "p-5")}>
          <p className="text-xs font-semibold text-muted">Fondo inicial</p>
          <p className="text-lg font-bold">
            {Object.entries(float)
              .map(([c, v]) => formatMoney(v ?? 0, c as Currency))
              .join(" · ") || "—"}
          </p>
        </div>
        <div className={cn(card, "p-5")}>
          <p className="text-xs font-semibold text-muted">Cobros por método</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {[...byMethod.values()].map((m) => (
              <li key={m.label + m.currency} className="flex justify-between">
                <span>
                  {m.label} ({m.n})
                </span>
                <b>{formatMoney(m.cents, m.currency)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {s.lines.length ? (
        <section className={cn(card, "mt-4 overflow-x-auto")}>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-cream text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Cuenta</th>
                <th className="px-2 py-2 text-right">Esperado</th>
                <th className="px-2 py-2 text-right">Contado</th>
                <th className="px-4 py-2 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.lines.map((l) => {
                const d = toCents(l.difference);
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-semibold">{l.financialAccount?.name ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(toCents(l.expected), l.currency)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(toCents(l.counted), l.currency)}</td>
                    <td className={cn("px-4 py-2 text-right font-semibold", d === 0 ? "text-ok" : "text-danger")}>{d === 0 ? "✓" : `${d > 0 ? "+" : ""}${formatMoney(d, l.currency)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
      {s.notes ? <p className={cn(card, "mt-4 p-4 text-sm")}>📝 {s.notes}</p> : null}

      {s.movements.length ? (
        <section className={cn(card, "mt-4 p-5")}>
          <h2 className="font-bold">Entradas y salidas de efectivo</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {s.movements.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.reason}</span>
                <b className={m.type === "PAY_IN" ? "text-ok" : "text-danger"}>
                  {m.type === "PAY_IN" ? "+" : "−"}
                  {formatMoney(toCents(m.amount), m.currency)}
                </b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

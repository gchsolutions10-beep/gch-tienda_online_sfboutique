import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getCreditSettings } from "@/server/services/credit";
import { PageHeader } from "@/components/admin/page-header";
import { buttonSecondary, card, cn } from "@/components/ui/styles";
import { installmentState } from "@/lib/credit";
import { formatUsd, toCents } from "@/lib/money";
import { formatVeId, formatVePhone, whatsappLink } from "@/lib/ve-ids";

export const metadata = { title: "Credi-SF" };

const APP_STATUS = {
  WAITING_GUARANTOR: ["Esperando al fiador", "bg-amber-100 text-amber-900"],
  IN_REVIEW: ["Por revisar", "bg-brand-soft text-brand-strong"],
  APPROVED: ["Aprobada", "bg-emerald-100 text-emerald-900"],
  REJECTED: ["Rechazada", "bg-cream text-muted"],
} as const;

/** Credi-SF en el panel: solicitudes por revisar y cobranza de las cuotas. */
export default async function CreditAdminPage({ params, searchParams }: PageProps<"/t/[domain]/admin/credito">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], "/admin/credito");
  const tab = (await searchParams).vista === "solicitudes" ? "solicitudes" : "cobranza";
  const tdb = tenantDb(tenant.id);
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const [settings, apps, pendingApps, installments, totals] = await Promise.all([
    getCreditSettings(tenant.id),
    tab === "solicitudes"
      ? tdb.creditApplication.findMany({
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 100,
          select: { id: true, status: true, fullName: true, idType: true, idNumber: true, phone: true, guarantorName: true, guarantorAcceptedAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    tdb.creditApplication.count({ where: { status: "IN_REVIEW" } }),
    // Cuotas sin pagar que vencen en los próximos 7 días o ya vencieron (solo créditos con la inicial pagada).
    tdb.creditPlan.findMany({
      where: { status: "ACTIVE", order: { paidAt: { not: null }, status: { not: "CANCELLED" } }, installments: { some: { paidAt: null, dueDate: { lte: soon } } } },
      select: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, creditLevel: true } },
        order: { select: { id: true, number: true, trackingToken: true } },
        installments: { where: { paidAt: null, dueDate: { lte: soon } }, orderBy: { number: "asc" }, select: { id: true, number: true, dueDate: true, amountUsd: true, lateFeeUsd: true, paidUsd: true } },
      },
    }),
    tdb.creditPlan.findMany({ where: { status: "ACTIVE", order: { paidAt: { not: null } } }, select: { financedUsd: true, installments: { select: { amountUsd: true, lateFeeUsd: true, paidUsd: true } } } }),
  ]);
  const portfolio = totals.reduce((a, p) => a + p.installments.reduce((b, i) => b + toCents(i.amountUsd) + toCents(i.lateFeeUsd) - toCents(i.paidUsd), 0), 0);
  const rows = installments
    .flatMap((p) => p.installments.map((i) => ({ ...i, customer: p.customer, order: p.order, state: installmentState({ dueDate: i.dueDate, paid: false }, now, settings.graceDays) })))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const late = rows.filter((r) => r.state.state === "late" || r.state.state === "grace");
  const fmt = (d: Date) => d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Caracas" });

  return (
    <>
      <PageHeader
        title="Credi-SF"
        description="Compras a crédito: solicitudes, cobranza de cuotas y niveles de las clientas."
        actions={isTenantAdmin(ctx) ? <Link href="/admin/credito/configuracion" className={buttonSecondary}>⚙️ Configuración</Link> : null}
      />
      {!settings.enabled ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          El crédito está <b>apagado</b>: la tienda no lo ofrece. {isTenantAdmin(ctx) ? <Link href="/admin/credito/configuracion" className="font-semibold underline">Activarlo</Link> : null}
        </p>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className={cn(card, "p-4")}>
          <p className="text-xs font-semibold text-muted">Por cobrar (cartera)</p>
          <p className="text-2xl font-bold">{formatUsd(portfolio)}</p>
          <p className="text-xs text-muted">{totals.length} créditos activos</p>
        </div>
        <div className={cn(card, "p-4", late.length > 0 && "border-red-200 bg-red-50")}>
          <p className="text-xs font-semibold text-muted">Cuotas vencidas</p>
          <p className="text-2xl font-bold">{late.length}</p>
          <p className="text-xs text-muted">{formatUsd(late.reduce((a, r) => a + toCents(r.amountUsd) + toCents(r.lateFeeUsd) - toCents(r.paidUsd), 0))}</p>
        </div>
        <Link href="/admin/credito?vista=solicitudes" className={cn(card, "p-4 hover:border-brand", pendingApps > 0 && "border-brand")}>
          <p className="text-xs font-semibold text-muted">Solicitudes por revisar</p>
          <p className="text-2xl font-bold">{pendingApps}</p>
          <p className="text-xs text-muted">Ver solicitudes →</p>
        </Link>
      </div>

      <nav className="mb-4 flex gap-1" aria-label="Vistas">
        {(
          [
            ["cobranza", "Cobranza"],
            ["solicitudes", "Solicitudes"],
          ] as const
        ).map(([k, label]) => (
          <Link key={k} href={`/admin/credito?vista=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", tab === k ? "bg-ink text-white" : "bg-paper hover:bg-line")}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "cobranza" ? (
        <div className={cn(card, "overflow-x-auto")}>
          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">No hay cuotas vencidas ni por vencer en los próximos 7 días.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Vence</th>
                  <th className="px-4 py-2">Clienta</th>
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2 text-right">Debe</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const owed = toCents(r.amountUsd) + toCents(r.lateFeeUsd) - toCents(r.paidUsd);
                  const name = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ");
                  const msg =
                    r.state.state === "upcoming" || r.state.state === "due-today"
                      ? `¡Hola ${r.customer.firstName}! Te recordamos que tu cuota ${r.number} de ${formatUsd(owed)} del pedido #${r.order.number} vence el ${fmt(r.dueDate)}. Puedes pagarla aquí: `
                      : `¡Hola ${r.customer.firstName}! Tu cuota ${r.number} de ${formatUsd(owed)} del pedido #${r.order.number} venció el ${fmt(r.dueDate)}. Ponte al día para evitar recargos. Paga aquí: `;
                  return (
                    <tr key={r.id} className={r.state.state === "late" ? "bg-red-50" : undefined}>
                      <td className="px-4 py-2.5">{fmt(r.dueDate)}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/clientes/${r.customer.id}`} className="font-semibold hover:underline">{name}</Link>
                        <span className="block text-xs text-muted">Nivel {r.customer.creditLevel}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/pedidos/${r.order.id}`} className="hover:underline">#{r.order.number}</Link> · cuota {r.number}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {formatUsd(owed)}
                        {toCents(r.lateFeeUsd) ? <span className="block text-xs font-normal text-red-800">incl. mora</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold">
                        {r.state.state === "late" ? `En mora · ${r.state.daysLate} días` : r.state.state === "grace" ? `En gracia · ${r.state.daysLate} días` : r.state.state === "due-today" ? "Vence hoy" : "Por vencer"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.customer.phone ? (
                          <a href={whatsappLink(r.customer.phone, msg)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ok underline">
                            WhatsApp
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className={cn(card, "overflow-hidden")}>
          {apps.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">Aún no hay solicitudes.</p>
          ) : (
            <ul className="divide-y divide-line">
              {apps.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/credito/solicitudes/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-cream">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{a.fullName}</span>
                      <span className="block text-xs text-muted">
                        {formatVeId(a.idType, a.idNumber)} · {formatVePhone(a.phone)} · fiador {a.guarantorName}
                        {a.guarantorAcceptedAt ? " (aceptó)" : ""} · {fmt(a.createdAt)}
                      </span>
                    </span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", APP_STATUS[a.status][1])}>{APP_STATUS[a.status][0]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

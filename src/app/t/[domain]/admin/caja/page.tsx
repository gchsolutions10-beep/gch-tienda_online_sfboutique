import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { getCurrentRates } from "@/server/queries/store";
import { getPaymentSetup, getRegister } from "@/server/queries/cash";
import { getDeliverySettings } from "@/server/services/orders";
import { getOpenSession, sessionSummary } from "@/server/services/cash";
import { PageHeader } from "@/components/admin/page-header";
import { StoreSale } from "@/components/admin/store-sale";
import { CashMovementForm, OpenSessionForm } from "@/components/admin/cash-forms";
import { buttonPrimary, buttonSecondary, card, cn } from "@/components/ui/styles";
import { formatMoney, formatUsd, formatVes, toCents } from "@/lib/money";

export const metadata = { title: "Caja" };

export default async function CashPage({ params, searchParams }: PageProps<"/t/[domain]/admin/caja">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CASHIER_ROLES, "/admin/caja");
  const sp = await searchParams;
  const { registers, register } = await getRegister(tenant.id, typeof sp.caja === "string" ? sp.caja : undefined);
  const history = (
    <Link href="/admin/caja/turnos" className={buttonSecondary}>
      Turnos anteriores
    </Link>
  );
  if (!register) {
    return (
      <>
        <PageHeader title="Caja" />
        <p className={cn(card, "p-6 text-sm text-muted")}>No hay cajas configuradas.</p>
      </>
    );
  }

  const [session, rates, setup, settings] = await Promise.all([
    getOpenSession(tenant.id, register.id),
    getCurrentRates(tenant.id),
    getPaymentSetup(tenant.id),
    getDeliverySettings(tenant.id),
  ]);
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });

  if (!session) {
    return (
      <>
        <PageHeader title={`Caja · ${register.name}`} description="Ventas en la tienda física con pagos mixtos en bolívares, dólares y USDT." actions={history} />
        {registers.length > 1 ? <RegisterTabs registers={registers} current={register.id} /> : null}
        <OpenSessionForm registerId={register.id} />
      </>
    );
  }

  const summary = (await sessionSummary(tenant.id, session.id))!;
  const cashAccounts = setup.accounts.filter((a) => a.type === "CASH_VES" || a.type === "CASH_USD");

  return (
    <>
      <PageHeader
        title={`Caja · ${register.name}`}
        description={`Turno abierto el ${fmt(session.openedAt)} por ${session.openedBy.name ?? session.openedBy.email}`}
        actions={
          <>
            {history}
            <Link href={`/admin/caja/cierre?turno=${session.id}`} className={buttonPrimary}>
              Cerrar turno
            </Link>
          </>
        }
      />
      {!rates.bcv ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Carga la tasa BCV del día en{" "}
          <Link href="/admin/tasas" className="underline">
            Tasas
          </Link>{" "}
          para poder vender.
        </p>
      ) : (
        <StoreSale sessionId={session.id} bcvRate={rates.bcv.rate} accounts={setup.accounts} methods={setup.methods} tax={settings.tax} />
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className={cn(card, "p-5")}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Ventas del turno</h2>
            <p className="text-sm">
              <b>{formatUsd(summary.salesUsd)}</b> <span className="text-muted">· {formatVes(summary.salesVes)}</span>
            </p>
          </div>
          {summary.session.orders.length === 0 ? <p className="mt-2 text-sm text-muted">Todavía no hay ventas.</p> : null}
          <ul className="mt-2 divide-y divide-line text-sm">
            {summary.session.orders.slice(0, 15).map((o) => (
              <li key={o.id} className="flex justify-between py-1.5">
                <Link href={`/admin/pedidos/${o.id}`} className="hover:underline">
                  #{o.number} · {o.customerName}
                </Link>
                <span className="font-semibold">{formatUsd(toCents(o.totalUsd))}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={cn(card, "space-y-3 p-5")}>
          <h2 className="text-lg font-bold">En caja ahora</h2>
          <ul className="space-y-1 text-sm">
            {summary.expected.map((l) => (
              <li key={l.accountId} className="flex justify-between">
                <span>{l.name}</span>
                <b>{formatMoney(l.expected, l.currency)}</b>
              </li>
            ))}
          </ul>
          {summary.session.movements.length ? (
            <ul className="space-y-0.5 border-t border-line pt-2 text-xs text-muted">
              {summary.session.movements.map((m) => (
                <li key={m.id}>
                  {m.type === "PAY_IN" ? "＋" : "−"} {formatMoney(toCents(m.amount), m.currency)} · {m.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {cashAccounts.length ? <CashMovementForm sessionId={session.id} cashAccounts={cashAccounts} /> : null}
        </section>
      </div>
    </>
  );
}

function RegisterTabs({ registers, current }: { registers: { id: string; name: string }[]; current: string }) {
  return (
    <nav className="mb-4 flex gap-1">
      {registers.map((r) => (
        <Link key={r.id} href={`/admin/caja?caja=${r.id}`} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", r.id === current ? "bg-ink text-white" : "bg-paper")}>
          {r.name}
        </Link>
      ))}
    </nav>
  );
}

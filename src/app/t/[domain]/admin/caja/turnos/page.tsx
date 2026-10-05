import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { card, cn } from "@/components/ui/styles";
import { formatMoney, toCents, type Currency } from "@/lib/money";

export const metadata = { title: "Turnos de caja" };

export default async function SessionsPage({ params }: PageProps<"/t/[domain]/admin/caja/turnos">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CASHIER_ROLES, "/admin/caja/turnos");
  const sessions = await tenantDb(tenant.id).cashSession.findMany({
    orderBy: { openedAt: "desc" },
    take: 60,
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      register: { select: { name: true } },
      openedBy: { select: { name: true, email: true } },
      _count: { select: { orders: true } },
      lines: { select: { currency: true, difference: true } },
    },
  });
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });

  return (
    <>
      <Link href="/admin/caja" className="text-sm font-semibold text-muted hover:text-ink">
        ← Caja
      </Link>
      <PageHeader title="Turnos de caja" description="Cada apertura y cierre con sus diferencias por moneda." />
      <div className={cn(card, "overflow-hidden")}>
        {sessions.length === 0 ? <p className="p-10 text-center text-sm text-muted">Todavía no hay turnos.</p> : null}
        <ul className="divide-y divide-line">
          {sessions.map((s) => {
            const diffs = new Map<Currency, number>();
            for (const l of s.lines) diffs.set(l.currency, (diffs.get(l.currency) ?? 0) + toCents(l.difference));
            const off = [...diffs].filter(([, v]) => v !== 0);
            return (
              <li key={s.id}>
                <Link href={s.status === "OPEN" ? "/admin/caja" : `/admin/caja/turnos/${s.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-cream">
                  <span className="min-w-0 flex-1">
                    <b>{s.register.name}</b> · {fmt(s.openedAt)}
                    {s.closedAt ? ` → ${fmt(s.closedAt)}` : ""}
                    <span className="block text-xs text-muted">
                      {s.openedBy.name ?? s.openedBy.email} · {s._count.orders} ventas
                    </span>
                  </span>
                  {s.status === "OPEN" ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">Abierto</span>
                  ) : off.length ? (
                    <span className="text-sm font-semibold text-danger">{off.map(([c, v]) => formatMoney(v, c)).join(" · ")}</span>
                  ) : (
                    <span className="text-sm font-semibold text-ok">✓ Cuadró</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

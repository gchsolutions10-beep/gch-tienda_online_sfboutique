import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { releaseExpiredReservations } from "@/server/services/orders";
import { PageHeader } from "@/components/admin/page-header";
import { OrderStatusBadge, PaymentStatusText } from "@/components/admin/order-badges";
import { card, cn, inputClass, buttonSecondary } from "@/components/ui/styles";
import { formatUsd, formatVes, toCents } from "@/lib/money";
import { FULFILLMENT } from "@/lib/orders";
import { formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Pedidos" };

/** Pestañas por lo que hay que HACER con el pedido. */
const TABS: { key: string; label: string; statuses: OrderStatus[] | null }[] = [
  { key: "verificar", label: "Pagos por verificar", statuses: ["PAYMENT_REVIEW"] },
  { key: "cobrar", label: "Esperando pago", statuses: ["PENDING"] },
  { key: "preparar", label: "Por preparar", statuses: ["PAID", "PREPARING"] },
  { key: "entregar", label: "Por entregar", statuses: ["READY", "SHIPPED"] },
  { key: "entregados", label: "Entregados", statuses: ["DELIVERED"] },
  { key: "anulados", label: "Anulados", statuses: ["CANCELLED"] },
  { key: "todos", label: "Todos", statuses: null },
];

export default async function OrdersPage({ params, searchParams }: PageProps<"/t/[domain]/admin/pedidos">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CASHIER_ROLES, "/admin/pedidos");
  await releaseExpiredReservations(tenant.id);
  const sp = await searchParams;
  const tdb = tenantDb(tenant.id);

  const counts = await tdb.order.groupBy({ by: ["status"], _count: { _all: true } });
  const countOf = (statuses: OrderStatus[] | null) =>
    counts.filter((c) => !statuses || statuses.includes(c.status)).reduce((a, c) => a + c._count._all, 0);

  const requested = typeof sp.estado === "string" ? sp.estado : null;
  // Por defecto, la primera pestaña con algo pendiente.
  const tab = TABS.find((t) => t.key === requested) ?? TABS.slice(0, 4).find((t) => countOf(t.statuses) > 0) ?? TABS[6];
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const asNumber = Number(q.replace(/^#/, ""));

  const where: Prisma.OrderWhereInput = {
    ...(tab.statuses ? { status: { in: tab.statuses } } : {}),
    ...(q
      ? {
          OR: [
            ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerPhone: { contains: q.replace(/\D/g, "").replace(/^0/, "") || q } },
            { customerIdNumber: { contains: q.replace(/\D/g, "") || q } },
          ],
        }
      : {}),
  };
  const orders = await tdb.order.findMany({
    where,
    orderBy: { createdAt: tab.key === "todos" || tab.key === "entregados" || tab.key === "anulados" ? "desc" : "asc" },
    take: 100,
    select: {
      id: true,
      number: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      fulfillment: true,
      channel: true,
      customerName: true,
      customerPhone: true,
      totalUsd: true,
      totalVes: true,
      _count: { select: { items: true } },
    },
  });
  const fmt = (d: Date) => d.toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });

  return (
    <>
      <PageHeader title="Pedidos" description="Pedidos de la tienda web. Verifica los pagos reportados, prepara y entrega." />

      <nav aria-label="Estados" className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
        {TABS.map((t) => {
          const n = countOf(t.statuses);
          return (
            <Link
              key={t.key}
              href={`/admin/pedidos?estado=${t.key}`}
              aria-current={t.key === tab.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                t.key === tab.key ? "bg-ink text-white" : "bg-paper text-ink hover:bg-line",
              )}
            >
              {t.label}
              {n && t.key !== "todos" && t.key !== "entregados" && t.key !== "anulados" ? (
                <span className={cn("rounded-full px-1.5 text-xs", t.key === tab.key ? "bg-white/20" : "bg-brand text-on-brand")}>{n}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <form className="mb-4 flex gap-2" action="/admin/pedidos">
        <input type="hidden" name="estado" value={tab.key} />
        <input name="q" defaultValue={q} placeholder="Buscar por #número, nombre, teléfono o cédula" className={cn(inputClass, "max-w-md")} />
        <button className={buttonSecondary}>Buscar</button>
      </form>

      <div className={cn(card, "overflow-hidden")}>
        {orders.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">No hay pedidos aquí.</p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/pedidos/${o.id}`} className="grid gap-2 px-4 py-3 transition hover:bg-cream sm:grid-cols-[5rem_minmax(0,1fr)_10rem_9rem_9rem] sm:items-center">
                  <span className="font-display text-lg font-bold">#{o.number}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{o.customerName}</span>
                    <span className="block text-xs text-muted">
                      {fmt(o.createdAt)} · {o._count.items} {o._count.items === 1 ? "artículo" : "artículos"}
                      {o.customerPhone ? ` · ${formatVePhone(o.customerPhone)}` : ""}
                    </span>
                  </span>
                  <span className="text-sm">
                    {FULFILLMENT[o.fulfillment].icon} {FULFILLMENT[o.fulfillment].label}
                  </span>
                  <span className="sm:text-right">
                    <span className="block font-semibold">{formatUsd(toCents(o.totalUsd))}</span>
                    <span className="block text-xs text-muted">{formatVes(toCents(o.totalVes))}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    <OrderStatusBadge status={o.status} />
                    <PaymentStatusText status={o.paymentStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

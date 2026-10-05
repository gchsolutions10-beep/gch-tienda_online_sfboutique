import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { getCustomer } from "@/server/queries/crm";
import { PageHeader } from "@/components/admin/page-header";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { CustomerForm, InteractionForm, TagPicker } from "@/components/admin/customer-forms";
import { card, cn } from "@/components/ui/styles";
import { formatUsd, formatVes, toCents } from "@/lib/money";
import { autoSegments, INTERACTION, purchaseFrequencyDays, SEGMENT_COLOR, SEGMENT_LABEL } from "@/lib/crm";
import { PAYMENT_METHODS } from "@/lib/payments";
import { formatVeId, formatVePhone, whatsappLink } from "@/lib/ve-ids";

export const metadata = { title: "Clienta" };

export default async function CustomerPage({ params }: PageProps<"/t/[domain]/admin/clientes/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, CASHIER_ROLES, `/admin/clientes/${id}`);
  const data = await getCustomer(tenant.id, id);
  if (!data) notFound();
  const { customer: c, tags, rules } = data;
  const stats = { ordersCount: c.ordersCount, totalSpentUsdCents: toCents(c.totalSpentUsd), firstOrderAt: c.firstOrderAt, lastOrderAt: c.lastOrderAt };
  const segments = autoSegments(stats, rules);
  const frequency = purchaseFrequencyDays(stats);
  const avg = c.ordersCount ? Math.round(toCents(c.totalSpentUsd) / c.ordersCount) : 0;
  const daysSince = c.lastOrderAt ? Math.floor((new Date().getTime() - c.lastOrderAt.getTime()) / 86_400_000) : null;
  const fmt = (d: Date) => d.toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Caracas" });
  const fmtTime = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });

  // Tallas y colores que más compra (de sus pedidos no anulados).
  const counter = (key: "sizeLabel" | "colorName") => {
    const m = new Map<string, number>();
    for (const o of c.orders) if (o.status !== "CANCELLED") for (const it of o.items) if (it[key]) m.set(it[key]!, (m.get(it[key]!) ?? 0) + it.quantity);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  };
  const sizes = counter("sizeLabel");
  const colors = counter("colorName");

  return (
    <>
      <Link href="/admin/clientes" className="text-sm font-semibold text-muted hover:text-ink">
        ← Clientes
      </Link>
      <PageHeader
        title={[c.firstName, c.lastName].filter(Boolean).join(" ")}
        description={[c.idNumber && formatVeId(c.idType, c.idNumber), c.phone && formatVePhone(c.phone), `Clienta desde ${fmt(c.createdAt)}`].filter(Boolean).join(" · ")}
        actions={
          c.phone ? (
            <a href={whatsappLink(c.phone, `¡Hola ${c.firstName}! Te escribimos de ${tenant.name}.`)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
              💬 WhatsApp
            </a>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {segments.map((s) => (
          <span key={s} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: SEGMENT_COLOR[s] }}>
            {SEGMENT_LABEL[s]}
          </span>
        ))}
        <TagPicker customerId={c.id} tags={tags} active={c.tags.map((t) => t.tagId)} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total comprado", formatUsd(toCents(c.totalSpentUsd)), formatVes(toCents(c.totalSpentVes))],
          ["Compras", String(c.ordersCount), avg ? `Ticket promedio ${formatUsd(avg)}` : ""],
          ["Última compra", c.lastOrderAt ? fmt(c.lastOrderAt) : "—", daysSince === null ? "" : daysSince === 0 ? "hoy" : daysSince === 1 ? "ayer" : `hace ${daysSince} días`],
          ["Compra cada", frequency !== null ? `${frequency} días` : "—", "en promedio"],
          ["Paga con", c.favoritePaymentMethod ? PAYMENT_METHODS[c.favoritePaymentMethod].label : "—", "método favorito"],
        ].map(([label, value, hint]) => (
          <div key={label} className={cn(card, "p-4")}>
            <p className="text-xs font-semibold text-muted">{label}</p>
            <p className="mt-0.5 font-display text-xl font-bold">{value}</p>
            {hint ? <p className="text-xs text-muted">{hint}</p> : null}
          </div>
        ))}
      </div>
      {sizes.length || colors.length ? (
        <p className="-mt-3 mb-6 text-sm text-muted">
          {sizes.length ? <>Tallas que compra: <b className="text-ink">{sizes.join(", ")}</b>. </> : null}
          {colors.length ? <>Colores: <b className="text-ink">{colors.join(", ")}</b>.</> : null}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className={cn(card, "p-5")}>
            <h2 className="text-lg font-bold">Compras</h2>
            {c.orders.length === 0 ? <p className="mt-2 text-sm text-muted">Todavía no ha comprado.</p> : null}
            <ul className="mt-2 divide-y divide-line text-sm">
              {c.orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/pedidos/${o.id}`} className="flex flex-wrap items-center gap-2 py-2.5 hover:bg-cream">
                    <span className="w-16 font-bold">#{o.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.items.map((it) => `${it.quantity}× ${it.productName}${it.sizeLabel ? ` (${it.sizeLabel})` : ""}`).join(", ")}</span>
                      <span className="text-xs text-muted">
                        {fmt(o.createdAt)} · {o.channel === "STORE" ? "Tienda física" : o.channel === "WEB" ? "Tienda web" : o.channel}
                      </span>
                    </span>
                    <OrderStatusBadge status={o.status} />
                    <span className="w-20 text-right font-semibold">{formatUsd(toCents(o.totalUsd))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-bold">Datos</h2>
            <CustomerForm
              initial={{
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName ?? "",
                idDoc: c.idNumber ? formatVeId(c.idType, c.idNumber) : "",
                phone: c.phone ? formatVePhone(c.phone) : "",
                email: c.email ?? "",
                instagram: c.instagram ? `@${c.instagram}` : "",
                birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : "",
                source: c.source,
                notes: c.notes ?? "",
                marketingOptIn: c.marketingOptIn,
                isWholesale: c.isWholesale,
              }}
            />
          </section>
        </div>

        <section className={cn(card, "h-fit space-y-4 p-5")}>
          <h2 className="text-lg font-bold">Seguimiento</h2>
          <InteractionForm customerId={c.id} />
          <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
            {c.interactions.map((i) => (
              <li key={i.id}>
                <p>
                  <span aria-hidden>{INTERACTION[i.type].icon}</span> <b>{INTERACTION[i.type].label}</b> · {i.body}
                </p>
                <p className="text-xs text-muted">
                  {fmtTime(i.createdAt)}
                  {i.user ? ` · ${i.user.name ?? i.user.email}` : ""}
                </p>
              </li>
            ))}
            {c.interactions.length === 0 ? <li className="text-muted">Sin seguimiento todavía.</li> : null}
          </ol>
        </section>
      </div>
    </>
  );
}

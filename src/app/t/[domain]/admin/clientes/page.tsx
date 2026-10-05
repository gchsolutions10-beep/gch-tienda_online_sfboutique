import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { listCustomers, type CustomerFilter } from "@/server/queries/crm";
import { PageHeader } from "@/components/admin/page-header";
import { buttonPrimary, buttonSecondary, card, cn, inputClass } from "@/components/ui/styles";
import { formatUsd, toCents } from "@/lib/money";
import { SEGMENT_COLOR, SEGMENT_LABEL, SOURCE_LABEL } from "@/lib/crm";
import { formatVeId, formatVePhone, whatsappLink } from "@/lib/ve-ids";

export const metadata = { title: "Clientes" };

const SORTS = { recientes: "Compra reciente", gasto: "Mayor gasto", compras: "Más compras", nombre: "Nombre" } as const;

export default async function CustomersPage({ params, searchParams }: PageProps<"/t/[domain]/admin/clientes">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireStaff(tenant, CASHIER_ROLES, "/admin/clientes");
  const canExport = ctx.roles.some((r) => r === "SUPER_ADMIN" || r === "TENANT_ADMIN" || r === "BRANCH_ADMIN");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const sort = (Object.keys(SORTS).includes(str("orden")) ? str("orden") : "recientes") as CustomerFilter["sort"];
  const filter: CustomerFilter = { q: str("q").trim().slice(0, 60), segment: str("segmento"), sort };
  const { customers, counts, tags } = await listCustomers(tenant.id, filter);

  const href = (patch: Record<string, string>) => {
    const s = new URLSearchParams({ ...(filter.q ? { q: filter.q } : {}), ...(filter.segment ? { segmento: filter.segment } : {}), ...(sort !== "recientes" ? { orden: sort } : {}), ...patch });
    for (const [k, v] of [...s]) if (!v) s.delete(k);
    return `/admin/clientes${s.size ? `?${s}` : ""}`;
  };
  const chips: { key: string; label: string; color?: string; n: number }[] = [
    { key: "", label: "Todas", n: counts.todos },
    { key: "VIP", label: SEGMENT_LABEL.VIP, color: SEGMENT_COLOR.VIP, n: counts.VIP },
    { key: "RECURRENT", label: SEGMENT_LABEL.RECURRENT, color: SEGMENT_COLOR.RECURRENT, n: counts.RECURRENT },
    { key: "NEW", label: "Nuevas", color: SEGMENT_COLOR.NEW, n: counts.NEW },
    { key: "INACTIVE", label: "Inactivas", color: SEGMENT_COLOR.INACTIVE, n: counts.INACTIVE },
    { key: "sin-compras", label: "Sin compras", n: counts["sin-compras"] },
    { key: "mayorista", label: "Mayoristas", n: counts.mayorista },
    { key: "cumple", label: "🎂 Cumplen este mes", n: counts.cumple },
    ...tags.map((t) => ({ key: `tag:${t.id}`, label: t.name, color: t.color, n: t._count.customers })),
  ];
  const exportHref = `/admin/clientes/exportar?${new URLSearchParams({ ...(filter.q ? { q: filter.q } : {}), ...(filter.segment ? { segmento: filter.segment } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Tus clientas, lo que compran y su seguimiento. Los segmentos VIP, Recurrente, Nueva e Inactiva se calculan solos."
        actions={
          <>
            {canExport ? <a href={exportHref} className={buttonSecondary}>⬇ Exportar CSV</a> : null}
            <Link href="/admin/clientes/nuevo" className={buttonPrimary}>+ Nueva clienta</Link>
          </>
        }
      />

      <form action="/admin/clientes" className="mb-3 flex flex-wrap gap-2">
        {filter.segment ? <input type="hidden" name="segmento" value={filter.segment} /> : null}
        <input name="q" defaultValue={filter.q} placeholder="Nombre, teléfono, cédula, correo o @instagram" className={cn(inputClass, "max-w-md")} />
        <select name="orden" defaultValue={sort} aria-label="Ordenar" className={cn(inputClass, "w-44")}>
          {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className={buttonSecondary}>Buscar</button>
      </form>

      <nav aria-label="Segmentos" className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {chips.map((c) => {
          const active = (filter.segment || "") === c.key;
          return (
            <Link
              key={c.key || "all"}
              href={href({ segmento: c.key })}
              aria-current={active ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold", active ? "border-ink bg-ink text-white" : "border-line bg-paper hover:bg-line")}
            >
              {c.color ? <span className="size-2.5 rounded-full" style={{ background: c.color }} /> : null}
              {c.label}
              <span className={cn("text-xs", active ? "opacity-80" : "text-muted")}>{c.n}</span>
            </Link>
          );
        })}
      </nav>

      <div className={cn(card, "overflow-hidden")}>
        {customers.length === 0 ? <p className="p-10 text-center text-sm text-muted">No hay clientas con ese filtro.</p> : null}
        <ul className="divide-y divide-line">
          {customers.slice(0, 300).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-cream">
              <Link href={`/admin/clientes/${c.id}`} className="min-w-0 flex-1">
                <span className="font-semibold">
                  {c.firstName} {c.lastName}
                </span>
                {c.birthdayMonth ? <span title="Cumple este mes"> 🎂</span> : null}
                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                  {c.segments.map((s) => (
                    <span key={s} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: SEGMENT_COLOR[s] }}>
                      {SEGMENT_LABEL[s]}
                    </span>
                  ))}
                  {c.isWholesale ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Mayorista</span> : null}
                  {c.tags.map((t) => (
                    <span key={t.tag.id} className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: t.tag.color, color: t.tag.color }}>
                      {t.tag.name}
                    </span>
                  ))}
                  <span className="text-xs text-muted">
                    {[c.idNumber && formatVeId(c.idType, c.idNumber), SOURCE_LABEL[c.source]].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
              <span className="w-32 text-right text-sm">
                <b>{formatUsd(toCents(c.totalSpentUsd))}</b>
                <span className="block text-xs text-muted">
                  {c.ordersCount} {c.ordersCount === 1 ? "compra" : "compras"}
                  {c.lastOrderAt ? ` · ${c.lastOrderAt.toLocaleDateString("es-VE", { day: "numeric", month: "short", timeZone: "America/Caracas" })}` : ""}
                </span>
              </span>
              {c.phone ? (
                <a href={whatsappLink(c.phone)} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${formatVePhone(c.phone)}`} className="grid size-9 place-items-center rounded-full bg-emerald-50 text-lg hover:bg-emerald-100">
                  💬
                </a>
              ) : (
                <span className="size-9" />
              )}
            </li>
          ))}
        </ul>
        {customers.length > 300 ? <p className="border-t border-line p-3 text-center text-xs text-muted">Se muestran 300 de {customers.length}. Usa la búsqueda o exporta el CSV.</p> : null}
      </div>
    </>
  );
}

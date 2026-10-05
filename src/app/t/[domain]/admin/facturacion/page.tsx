import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getSeries, isFiscalReady, listDocuments } from "@/server/services/invoices";
import { PageHeader } from "@/components/admin/page-header";
import { buttonPrimary, buttonSecondary, card, cn, inputBase, inputClass } from "@/components/ui/styles";
import { controlNumbersLeft, currentMonth, formatInvoiceNumber, INVOICE_TYPE, monthRange } from "@/lib/invoicing";
import { formatUsd, formatVes, toCents } from "@/lib/money";
import { formatVeId } from "@/lib/ve-ids";

export const metadata = { title: "Facturación" };

export default async function InvoicesPage({ params, searchParams }: PageProps<"/t/[domain]/admin/facturacion">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireStaff(tenant, CASHIER_ROLES, "/admin/facturacion");
  const owner = isTenantAdmin(ctx);
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && monthRange(sp.mes) ? sp.mes : currentMonth();
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const tdb = tenantDb(tenant.id);

  const [docs, series, pending] = await Promise.all([
    listDocuments(tenant.id, month, q),
    getSeries(tenant.id),
    // Pedidos pagados sin factura (los más recientes).
    tdb.order.findMany({
      where: { paidAt: { not: null }, status: { not: "CANCELLED" }, invoices: { none: { type: "INVOICE", status: "ISSUED" } } },
      orderBy: { paidAt: "desc" },
      take: 8,
      select: { id: true, number: true, customerName: true, totalUsd: true, paidAt: true, channel: true },
    }),
  ]);
  const ready = isFiscalReady(tenant);
  const invoiceSeries = series.find((s) => s.type === "INVOICE");
  const left = invoiceSeries ? controlNumbersLeft(invoiceSeries) : null;
  const missingControl = docs.filter((d) => d.status === "ISSUED" && !d.controlNumber && d.series.controlMode === "DIGITAL_PRINTER").length;
  const fmt = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Caracas" });

  return (
    <>
      <PageHeader
        title="Facturación"
        description="Facturas y notas de crédito/débito en bolívares a la tasa BCV, con su número de control. Validar con el contador."
        actions={
          <>
            {owner || ctx.roles.includes("BRANCH_ADMIN") ? (
              <Link href={`/admin/facturacion/libro?mes=${month}`} className={buttonSecondary}>📒 Libro de ventas</Link>
            ) : null}
            {owner ? <Link href="/admin/facturacion/configuracion" className={buttonSecondary}>⚙️ Configuración</Link> : null}
          </>
        }
      />

      {!ready ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          ⚠️ Para facturar falta la <b>razón social, el RIF y el domicilio fiscal</b> del negocio.{" "}
          {owner ? <Link href="/admin/facturacion/configuracion" className="font-semibold underline">Cargarlos ahora</Link> : "Pídeselo a la administradora."}
        </p>
      ) : null}
      {invoiceSeries?.controlMode === "NONE" ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          ⚠️ Las facturas salen <b>sin número de control</b>: no tienen validez fiscal. Configura tu imprenta digital o tus formatos de forma libre en Configuración.
        </p>
      ) : null}
      {left !== null && left <= 20 ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">⚠️ Quedan {left} números de control en tus formatos. Pide más a la imprenta.</p>
      ) : null}
      {missingControl ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">⚠️ {missingControl} documento(s) de este mes esperan el número de control de la imprenta digital.</p>
      ) : null}

      {pending.length ? (
        <section className={cn(card, "mb-6 p-5")}>
          <h2 className="font-bold">Pedidos pagados sin factura</h2>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-display font-bold">#{o.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  {o.customerName} <span className="text-xs text-muted">· {o.channel === "STORE" ? "tienda" : "web"} · {o.paidAt ? fmt(o.paidAt) : ""}</span>
                </span>
                <span className="font-semibold">{formatUsd(toCents(o.totalUsd))}</span>
                <Link href={`/admin/facturacion/emitir/${o.id}`} className={cn(buttonPrimary, "px-3 py-1.5 text-xs")}>Facturar</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form className="mb-4 flex flex-wrap gap-2" action="/admin/facturacion">
        <input type="month" name="mes" defaultValue={month} aria-label="Mes" className={cn(inputBase, "w-44")} />
        <input name="q" defaultValue={q} placeholder="Buscar por número, control, comprador o cédula" className={cn(inputClass, "max-w-sm")} />
        <button className={buttonSecondary}>Buscar</button>
      </form>

      <div className={cn(card, "overflow-x-auto")}>
        {docs.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">No hay documentos en este mes.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Fecha</th>
                <th className="px-4 py-2 font-semibold">Documento</th>
                <th className="px-4 py-2 font-semibold">N.º de control</th>
                <th className="px-4 py-2 font-semibold">Comprador</th>
                <th className="px-4 py-2 font-semibold">Pedido</th>
                <th className="px-4 py-2 text-right font-semibold">Total Bs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {docs.map((d) => (
                <tr key={d.id} className={cn("hover:bg-cream", d.status === "VOIDED" && "text-muted line-through")}>
                  <td className="px-4 py-2.5">{fmt(d.issuedAt)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/facturacion/${d.id}`} className="font-semibold text-brand-strong underline">
                      {INVOICE_TYPE[d.type].short} {formatInvoiceNumber(d.series.series, d.number)}
                    </Link>
                    {d.related ? <span className="block text-xs text-muted">afecta {formatInvoiceNumber(d.related.series.series, d.related.number)}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">{d.controlNumber ?? <span className="text-amber-800">{d.series.controlMode === "DIGITAL_PRINTER" ? "Pendiente" : "—"}</span>}</td>
                  <td className="px-4 py-2.5">
                    {d.buyerName}
                    {d.buyerIdNumber ? <span className="block text-xs text-muted">{formatVeId(d.buyerIdType, d.buyerIdNumber)}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/pedidos/${d.order.id}`} className="hover:underline">#{d.order.number}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {d.type === "CREDIT_NOTE" ? "−" : ""}
                    {formatVes(toCents(d.totalVes))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

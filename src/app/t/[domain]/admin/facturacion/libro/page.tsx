import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { salesBook } from "@/server/services/invoices";
import { PrintButton } from "@/components/admin/print-button";
import { buttonSecondary, card, cn, inputBase } from "@/components/ui/styles";
import { currentMonth, monthRange, salesBookTotals } from "@/lib/invoicing";
import { formatVes } from "@/lib/money";

export const metadata = { title: "Libro de ventas" };

/** Quién ve el libro: la dueña y la encargada (no las vendedoras). */
const BOOK_ROLES = ["TENANT_ADMIN", "BRANCH_ADMIN"] as const;

const n = (cents: number) => formatVes(cents).replace("Bs. ", "");

export default async function SalesBookPage({ params, searchParams }: PageProps<"/t/[domain]/admin/facturacion/libro">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, [...BOOK_ROLES], "/admin/facturacion/libro");
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && monthRange(sp.mes) ? sp.mes : currentMonth();
  const rows = await salesBook(tenant.id, month);
  const t = salesBookTotals(rows);
  const monthLabel = monthRange(month)!.from.toLocaleDateString("es-VE", { month: "long", year: "numeric", timeZone: "America/Caracas" });
  const date = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Caracas" });
  // Tasas de IVA presentes (normalmente solo la general).
  const rates = [...new Set(rows.filter((r) => r.ivaVes).map((r) => r.ivaRateBp))];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/admin/facturacion" className="text-sm font-semibold text-muted hover:text-ink">← Facturación</Link>
          <h1 className="mt-1 font-display text-2xl font-extrabold">Libro de ventas</h1>
          <p className="text-sm text-muted">Facturas y notas del mes en bolívares. Revísalo con tu contador antes de declarar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action="/admin/facturacion/libro" className="flex gap-2">
            <input type="month" name="mes" defaultValue={month} aria-label="Mes" className={cn(inputBase, "w-44")} />
            <button className={buttonSecondary}>Ver</button>
          </form>
          <a href={`/admin/facturacion/libro/exportar?mes=${month}`} className={buttonSecondary}>⬇️ Excel (CSV)</a>
          <PrintButton />
        </div>
      </div>

      <header className="mb-3 hidden print:block">
        <p className="font-bold uppercase">{tenant.legalName}</p>
        <p>RIF: {tenant.rif}</p>
        <p className="font-bold">Libro de ventas · {monthLabel}</p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        {[
          ["Documentos", String(t.documents)],
          ["Total ventas con IVA", formatVes(t.totalSalesVes)],
          ["Base imponible", formatVes(t.taxableVes)],
          ["IVA débito fiscal", formatVes(t.ivaVes)],
          ["IGTF", formatVes(t.igtfVes)],
        ].map(([label, value]) => (
          <div key={label} className={cn(card, "p-4")}>
            <p className="text-xs font-semibold text-muted">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className={cn(card, "overflow-x-auto print:overflow-visible print:border-0")}>
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">No hay documentos en {monthLabel}.</p>
        ) : (
          <table className="w-full min-w-[1100px] text-xs print:min-w-0 print:text-[9px]">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="px-2 py-2">N.º</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">RIF / C.I.</th>
                <th className="px-2 py-2">Nombre o razón social</th>
                <th className="px-2 py-2">Factura</th>
                <th className="px-2 py-2">N.º control</th>
                <th className="px-2 py-2">N. débito</th>
                <th className="px-2 py-2">N. crédito</th>
                <th className="px-2 py-2">Tipo trans.</th>
                <th className="px-2 py-2">Fact. afectada</th>
                <th className="px-2 py-2 text-right">Total ventas con IVA</th>
                <th className="px-2 py-2 text-right">Exentas / no sujetas</th>
                <th className="px-2 py-2 text-right">Base imponible</th>
                <th className="px-2 py-2 text-right">%</th>
                <th className="px-2 py-2 text-right">IVA</th>
                <th className="px-2 py-2 text-right">IGTF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={`${r.type}-${r.number}`} className={r.voided ? "text-muted" : undefined}>
                  <td className="px-2 py-1.5">{i + 1}</td>
                  <td className="px-2 py-1.5">{date(r.issuedAt)}</td>
                  <td className="px-2 py-1.5">{r.buyerId ?? "—"}</td>
                  <td className="px-2 py-1.5">{r.voided ? "ANULADA" : r.buyerName}</td>
                  <td className="px-2 py-1.5">{r.type === "INVOICE" ? r.number : ""}</td>
                  <td className="px-2 py-1.5">{r.controlNumber ?? "—"}</td>
                  <td className="px-2 py-1.5">{r.type === "DEBIT_NOTE" ? r.number : ""}</td>
                  <td className="px-2 py-1.5">{r.type === "CREDIT_NOTE" ? r.number : ""}</td>
                  <td className="px-2 py-1.5">{r.transaction}</td>
                  <td className="px-2 py-1.5">{r.affects ?? ""}</td>
                  <td className="px-2 py-1.5 text-right">{n(r.totalSalesVes)}</td>
                  <td className="px-2 py-1.5 text-right">{n(r.exemptVes)}</td>
                  <td className="px-2 py-1.5 text-right">{n(r.taxableVes)}</td>
                  <td className="px-2 py-1.5 text-right">{r.ivaVes ? r.ivaRateBp / 100 : ""}</td>
                  <td className="px-2 py-1.5 text-right">{n(r.ivaVes)}</td>
                  <td className="px-2 py-1.5 text-right">{r.igtfVes ? n(r.igtfVes) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-ink font-bold">
              <tr>
                <td className="px-2 py-2" colSpan={10}>Totales del mes</td>
                <td className="px-2 py-2 text-right">{n(t.totalSalesVes)}</td>
                <td className="px-2 py-2 text-right">{n(t.exemptVes)}</td>
                <td className="px-2 py-2 text-right">{n(t.taxableVes)}</td>
                <td className="px-2 py-2 text-right">{rates.length === 1 ? rates[0] / 100 : ""}</td>
                <td className="px-2 py-2 text-right">{n(t.ivaVes)}</td>
                <td className="px-2 py-2 text-right">{n(t.igtfVes)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        Tipo de transacción: 01 registro · 02 complemento (nota de débito) · 03 anulación (nota de crédito o documento anulado). Las notas de crédito restan. Los
        documentos anulados se listan en cero para no dejar saltos en la numeración. El IGTF va en su columna, fuera del total de ventas.
      </p>
    </>
  );
}

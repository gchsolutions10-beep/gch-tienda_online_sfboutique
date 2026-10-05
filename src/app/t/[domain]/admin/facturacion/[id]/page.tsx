import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { InvoiceDocument } from "@/components/admin/invoice-document";
import { ControlNumberForm, InvoiceActions } from "@/components/admin/invoice-forms";
import { PrintButton } from "@/components/admin/print-button";
import { card, cn } from "@/components/ui/styles";
import { creditedQuantities, formatInvoiceNumber, INVOICE_TYPE, parseLines } from "@/lib/invoicing";
import { formatVes, toCents } from "@/lib/money";
import { rateToBp } from "@/lib/tax-ve";
import { formatVeId, formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Documento fiscal" };

export default async function InvoicePage({ params }: PageProps<"/t/[domain]/admin/facturacion/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  const ctx = await requireStaff(tenant, CASHIER_ROLES, `/admin/facturacion/${id}`);
  const inv = await tenantDb(tenant.id).invoice.findFirst({
    where: { id },
    include: {
      series: { select: { series: true, controlMode: true } },
      order: { select: { id: true, number: true } },
      related: { select: { id: true, number: true, controlNumber: true, issuedAt: true, series: { select: { series: true } } } },
      notes: { orderBy: { issuedAt: "asc" }, select: { id: true, type: true, number: true, status: true, totalVes: true, lines: true, issuedAt: true, series: { select: { series: true } } } },
    },
  });
  if (!inv) notFound();

  const lines = parseLines(inv.lines);
  const number = formatInvoiceNumber(inv.series.series, inv.number);
  const isInvoice = inv.type === "INVOICE";
  const credited = creditedQuantities(lines, inv.notes.filter((n) => n.type === "CREDIT_NOTE" && n.status === "ISSUED").map((n) => parseLines(n.lines)));
  const pendingControl = inv.status === "ISSUED" && !inv.controlNumber && inv.series.controlMode === "DIGITAL_PRINTER";
  const canVoid = inv.status === "ISSUED" && !inv.notes.some((n) => n.status === "ISSUED") && !(inv.series.controlMode === "DIGITAL_PRINTER" && inv.controlNumber);
  const fmt = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Caracas" });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <Link href="/admin/facturacion" className="text-sm font-semibold text-muted hover:text-ink">← Facturación</Link>
          <h1 className="mt-1 font-display text-2xl font-extrabold">
            {INVOICE_TYPE[inv.type].label} N.º {number}
            {inv.status === "VOIDED" ? <span className="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 align-middle text-xs text-red-900">Anulada</span> : null}
          </h1>
          <p className="text-sm text-muted">
            Pedido <Link href={`/admin/pedidos/${inv.order.id}`} className="underline">#{inv.order.number}</Link>
            {inv.createdByName ? ` · emitió ${inv.createdByName}` : ""}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] print:block">
        <InvoiceDocument
          d={{
            type: inv.type,
            number,
            controlNumber: inv.controlNumber,
            controlNote: inv.series.controlMode === "DIGITAL_PRINTER" ? "pendiente (imprenta digital)" : inv.series.controlMode === "NONE" ? "sin número de control" : null,
            issuedAt: inv.issuedAt,
            voided: inv.status === "VOIDED" ? { at: inv.voidedAt, reason: inv.voidReason } : null,
            issuer: {
              legalName: tenant.legalName ?? tenant.name,
              rif: tenant.rif ?? "—",
              address: tenant.fiscalAddress ?? "—",
              phone: tenant.contactPhone ? formatVePhone(tenant.contactPhone) : null,
              email: tenant.contactEmail,
              logoUrl: tenant.logoUrl,
            },
            buyer: {
              name: inv.buyerName,
              id: inv.buyerIdNumber ? formatVeId(inv.buyerIdType, inv.buyerIdNumber) : null,
              address: inv.buyerAddress,
              phone: inv.buyerPhone ? formatVePhone(inv.buyerPhone) : null,
              email: inv.buyerEmail,
            },
            affects: inv.related ? { number: formatInvoiceNumber(inv.related.series.series, inv.related.number), controlNumber: inv.related.controlNumber, date: inv.related.issuedAt } : null,
            concept: inv.concept,
            orderNumber: inv.order.number,
            lines,
            taxableVes: toCents(inv.taxableVes),
            exemptVes: toCents(inv.exemptVes),
            ivaRateBp: rateToBp(inv.ivaRate),
            ivaVes: toCents(inv.ivaVes),
            igtfBaseVes: toCents(inv.igtfBaseVes),
            igtfVes: toCents(inv.igtfVes),
            totalVes: toCents(inv.totalVes),
            bcvRate: Number(inv.bcvRate),
            totalUsd: toCents(inv.totalUsd),
          }}
        />

        <div className="space-y-4 print:hidden">
          {pendingControl ? <ControlNumberForm invoiceId={inv.id} /> : null}
          {inv.status === "ISSUED" ? (
            <InvoiceActions
              invoiceId={inv.id}
              isInvoice={isInvoice}
              canVoid={canVoid}
              owner={isTenantAdmin(ctx)}
              lines={lines.map((l, i) => ({ description: l.description, unitVes: l.unitVes, available: Math.max(0, l.quantity - credited[i]) }))}
            />
          ) : null}
          {inv.notes.length ? (
            <section className={cn(card, "p-5 text-sm")}>
              <h2 className="font-bold">Notas sobre esta factura</h2>
              <ul className="mt-2 divide-y divide-line">
                {inv.notes.map((n) => (
                  <li key={n.id} className={cn("flex justify-between gap-2 py-2", n.status === "VOIDED" && "text-muted line-through")}>
                    <Link href={`/admin/facturacion/${n.id}`} className="font-semibold underline">
                      {INVOICE_TYPE[n.type].short} {formatInvoiceNumber(n.series.series, n.number)}
                    </Link>
                    <span>
                      {fmt(n.issuedAt)} · {n.type === "CREDIT_NOTE" ? "−" : "+"}
                      {formatVes(toCents(n.totalVes))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {inv.related ? (
            <Link href={`/admin/facturacion/${inv.related.id}`} className="block text-sm font-semibold text-brand-strong underline">
              Ver la factura afectada
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

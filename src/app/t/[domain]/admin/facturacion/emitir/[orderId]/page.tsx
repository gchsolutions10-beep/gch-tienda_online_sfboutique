import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { getSeries, isFiscalReady, previewOrderInvoice } from "@/server/services/invoices";
import { InvoiceDocument } from "@/components/admin/invoice-document";
import { IssueInvoiceForm } from "@/components/admin/invoice-forms";
import { CONTROL_MODE } from "@/lib/invoicing";
import { formatVes, toCents } from "@/lib/money";
import { formatVeId, formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Emitir factura" };

export default async function IssueInvoicePage({ params }: PageProps<"/t/[domain]/admin/facturacion/emitir/[orderId]">) {
  const { domain, orderId } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, CASHIER_ROLES, `/admin/facturacion/emitir/${orderId}`);
  const [preview, series] = await Promise.all([previewOrderInvoice(tenant.id, orderId), getSeries(tenant.id)]);
  if (!preview) notFound();
  const { order, amounts, bcvRate } = preview;
  const ready = isFiscalReady(tenant);
  const mode = series.find((s) => s.type === "INVOICE")?.controlMode ?? "NONE";
  const problem = preview.problem ?? (ready ? null : "Faltan la razón social, el RIF o el domicilio fiscal del negocio (Facturación > Configuración).");

  return (
    <>
      <Link href={`/admin/pedidos/${order.id}`} className="text-sm font-semibold text-muted hover:text-ink">
        ← Pedido #{order.number}
      </Link>
      <h1 className="mb-1 mt-2 font-display text-3xl font-extrabold">Facturar pedido #{order.number}</h1>
      <p className="mb-6 text-sm text-muted">
        Montos en bolívares a la tasa BCV de hoy. Número de control: {CONTROL_MODE[mode].label.toLowerCase()}.
      </p>

      {problem ? <p className="mb-6 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-950">⚠️ {problem}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {amounts && bcvRate ? (
          <InvoiceDocument
            d={{
              type: "INVOICE",
              number: null,
              controlNumber: null,
              controlNote: mode === "DIGITAL_PRINTER" ? "lo asigna la imprenta digital" : mode === "FREE_FORM" ? "el siguiente de tus formatos" : "sin número de control",
              issuedAt: new Date(),
              voided: null,
              issuer: {
                legalName: tenant.legalName ?? tenant.name,
                rif: tenant.rif ?? "—",
                address: tenant.fiscalAddress ?? "—",
                phone: tenant.contactPhone ? formatVePhone(tenant.contactPhone) : null,
                email: tenant.contactEmail,
                logoUrl: tenant.logoUrl,
              },
              buyer: {
                name: order.customerName,
                id: order.customerIdNumber ? formatVeId(order.customerIdType, order.customerIdNumber) : null,
                address: [order.shippingAddress, order.shippingCity, order.shippingState].filter(Boolean).join(", ") || null,
                phone: order.customerPhone ? formatVePhone(order.customerPhone) : null,
                email: order.customerEmail,
              },
              affects: null,
              concept: null,
              orderNumber: order.number,
              ...amounts,
              bcvRate,
              totalUsd: toCents(order.totalUsd) + toCents(order.igtfUsd),
            }}
          />
        ) : (
          <div />
        )}
        {!problem && amounts ? (
          <div className="space-y-4">
            <IssueInvoiceForm
              orderId={order.id}
              totalLabel={formatVes(amounts.totalVes)}
              buyer={{
                name: order.customerName === "Cliente de mostrador" ? "" : order.customerName,
                idDoc: order.customerIdNumber ? formatVeId(order.customerIdType, order.customerIdNumber) : "",
                address: [order.shippingAddress, order.shippingCity, order.shippingState].filter(Boolean).join(", "),
                phone: order.customerPhone ? formatVePhone(order.customerPhone) : "",
                email: order.customerEmail ?? "",
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

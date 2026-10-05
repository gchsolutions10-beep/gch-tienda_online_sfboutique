import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getSeries } from "@/server/services/invoices";
import { FiscalSettingsForm, SeriesForm } from "@/components/admin/invoice-forms";
import type { InvoiceType } from "@/lib/invoicing";

const SERIES_LABEL: Record<InvoiceType, string> = {
  INVOICE: "Facturas",
  CREDIT_NOTE: "Notas de crédito",
  DEBIT_NOTE: "Notas de débito",
  DELIVERY_NOTE: "Notas de entrega",
};

export const metadata = { title: "Configuración de facturación" };

/** "0.1600" → "16" · "0.0300" → "3" */
const pct = (v: { toString(): string } | null | undefined, fallback: string) => (v ? String(Math.round(Number(v.toString()) * 10_000) / 100).replace(".", ",") : fallback);

export default async function InvoiceSettingsPage({ params }: PageProps<"/t/[domain]/admin/facturacion/configuracion">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/facturacion/configuracion");
  if (!isTenantAdmin(ctx)) redirect("/sin-acceso");
  const tdb = tenantDb(tenant.id);
  const [settings, series, last] = await Promise.all([
    tdb.tenantSettings.findFirst(),
    getSeries(tenant.id),
    tdb.invoice.groupBy({ by: ["seriesId"], _max: { number: true } }),
  ]);

  return (
    <>
      <Link href="/admin/facturacion" className="text-sm font-semibold text-muted hover:text-ink">← Facturación</Link>
      <h1 className="mb-1 mt-2 font-display text-2xl font-extrabold">Configuración de facturación</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Esta configuración sigue las normas del SENIAT (Providencia 0071 y Reglamento de la Ley del IVA), pero cada negocio es distinto:{" "}
        <b>revísala con tu contador</b> antes de emitir la primera factura.
      </p>

      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <FiscalSettingsForm
          values={{
            legalName: tenant.legalName?.includes("por configurar") ? "" : (tenant.legalName ?? ""),
            rif: tenant.rif ?? "",
            fiscalAddress: tenant.fiscalAddress ?? "",
            ivaEnabled: settings?.ivaEnabled ?? true,
            ivaRate: pct(settings?.ivaRate, "16"),
            taxMode: settings?.taxMode ?? "PRICE_INCLUDES_TAX",
            isSpecialTaxpayer: settings?.isSpecialTaxpayer ?? false,
            igtfEnabled: settings?.igtfEnabled ?? false,
            igtfRate: pct(settings?.igtfRate, "3"),
          }}
        />
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand-soft p-4 text-sm">
            <p className="font-bold">¿Cómo funciona el número de control?</p>
            <p className="mt-1">
              Toda factura en Venezuela lleva un <b>número de control</b> que no pone el negocio: lo da una <b>imprenta autorizada por el SENIAT</b>. Hay dos formas:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>Imprenta digital:</b> la imprenta emite la factura electrónica y te devuelve el número de control. Emites aquí y anotas ese número en la factura.
              </li>
              <li>
                <b>Forma libre:</b> compras talonarios o formatos con el número de control ya impreso. Cargas aquí el rango y el sistema usa el siguiente en cada
                factura; la imprimes en tu formato.
              </li>
            </ul>
            <p className="mt-2">Si más adelante contratas una imprenta digital con conexión automática, se conecta aquí sin cambiar tus facturas anteriores.</p>
          </div>
          {series.map((s) => (
            <SeriesForm
              key={s.id}
              values={{
                id: s.id,
                label: SERIES_LABEL[s.type],
                series: s.series,
                nextNumber: s.nextNumber,
                controlMode: s.controlMode,
                controlPrefix: s.controlPrefix ?? "",
                nextControl: s.nextControl,
                controlTo: s.controlTo,
                lastIssued: last.find((l) => l.seriesId === s.id)?._max.number ?? null,
                controlEditable: s.type === "INVOICE",
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

import { getTenant } from "@/server/tenant";
import { getCurrentUser } from "@/server/auth/session";
import { resolveAccess } from "@/server/auth/guards";
import { salesBook } from "@/server/services/invoices";
import { centsToDecimalString } from "@/lib/money";
import { currentMonth, monthRange, salesBookTotals } from "@/lib/invoicing";

/** Libro de ventas del mes en CSV (Excel en español: punto y coma, coma decimal). */
export async function GET(request: Request, { params }: RouteContext<"/t/[domain]/admin/facturacion/libro/exportar">) {
  const tenant = await getTenant((await params).domain);
  const user = await getCurrentUser();
  const access = user ? resolveAccess(user, tenant.id, ["TENANT_ADMIN", "BRANCH_ADMIN"]) : null;
  if (!access) return new Response("No autorizado", { status: 403 });

  const param = new URL(request.url).searchParams.get("mes") ?? "";
  const month = monthRange(param) ? param : currentMonth();
  const rows = await salesBook(tenant.id, month);
  const t = salesBookTotals(rows);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Evita fórmulas al abrir en Excel (inyección CSV). Los montos negativos sí son números.
    const safe = /^[=+@]/.test(s) || (/^-/.test(s) && !/^-\d+(,\d+)?$/.test(s)) ? `'${s}` : s;
    return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const num = (cents: number) => centsToDecimalString(cents).replace(".", ",");
  const date = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Caracas" });
  const header = [
    "N.º",
    "Fecha",
    "RIF / C.I.",
    "Nombre o razón social",
    "N.º factura",
    "N.º control",
    "N.º nota de débito",
    "N.º nota de crédito",
    "Tipo de transacción",
    "Factura afectada",
    "Total ventas con IVA",
    "Ventas exentas o no sujetas",
    "Base imponible",
    "% alícuota",
    "Impuesto IVA",
    "IGTF",
  ];
  const body = rows.map((r, i) => [
    i + 1,
    date(r.issuedAt),
    r.buyerId ?? "",
    r.voided ? "ANULADA" : r.buyerName,
    r.type === "INVOICE" ? r.number : "",
    r.controlNumber ?? "",
    r.type === "DEBIT_NOTE" ? r.number : "",
    r.type === "CREDIT_NOTE" ? r.number : "",
    r.transaction,
    r.affects ?? "",
    num(r.totalSalesVes),
    num(r.exemptVes),
    num(r.taxableVes),
    r.ivaVes ? String(r.ivaRateBp / 100).replace(".", ",") : "",
    num(r.ivaVes),
    num(r.igtfVes),
  ]);
  const totals = ["", "", "", "TOTALES", "", "", "", "", "", "", num(t.totalSalesVes), num(t.exemptVes), num(t.taxableVes), "", num(t.ivaVes), num(t.igtfVes)];
  const csv = "﻿" + [header, ...body, totals].map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="libro-de-ventas-${tenant.slug}-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

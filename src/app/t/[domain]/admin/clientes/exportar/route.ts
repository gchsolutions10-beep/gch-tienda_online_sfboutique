import { getTenant } from "@/server/tenant";
import { getCurrentUser } from "@/server/auth/session";
import { resolveAccess } from "@/server/auth/guards";
import { listCustomers } from "@/server/queries/crm";
import { centsToDecimalString, toCents } from "@/lib/money";
import { SEGMENT_LABEL, SOURCE_LABEL } from "@/lib/crm";
import { formatVeId, formatVePhone } from "@/lib/ve-ids";

/** CSV de clientas (para campañas por WhatsApp o Excel). Solo la dueña o la encargada: son datos personales. */
export async function GET(request: Request, { params }: RouteContext<"/t/[domain]/admin/clientes/exportar">) {
  const tenant = await getTenant((await params).domain);
  const user = await getCurrentUser();
  const access = user ? resolveAccess(user, tenant.id, ["TENANT_ADMIN", "BRANCH_ADMIN"]) : null;
  if (!access) return new Response("No autorizado", { status: 403 });

  const url = new URL(request.url);
  const { customers } = await listCustomers(tenant.id, { q: url.searchParams.get("q") ?? "", segment: url.searchParams.get("segmento") ?? "", sort: "nombre" });
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Evita fórmulas al abrir en Excel (inyección CSV).
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ["Nombre", "Apellido", "Cédula/RIF", "WhatsApp", "Correo", "Instagram", "Cumpleaños", "Origen", "Acepta promociones", "Mayorista", "Segmentos", "Etiquetas", "Compras", "Total USD", "Total Bs", "Última compra"];
  const rows = customers.map((c) => [
    c.firstName,
    c.lastName,
    c.idNumber ? formatVeId(c.idType, c.idNumber) : "",
    c.phone ? formatVePhone(c.phone) : "",
    c.email ?? "",
    c.instagram ? `@${c.instagram}` : "",
    c.birthday ? c.birthday.toISOString().slice(0, 10) : "",
    SOURCE_LABEL[c.source],
    c.marketingOptIn ? "Sí" : "No",
    c.isWholesale ? "Sí" : "No",
    c.segments.map((s) => SEGMENT_LABEL[s]).join(" / "),
    c.tags.map((t) => t.tag.name).join(" / "),
    c.ordersCount,
    centsToDecimalString(toCents(c.totalSpentUsd)).replace(".", ","),
    centsToDecimalString(toCents(c.totalSpentVes)).replace(".", ","),
    c.lastOrderAt ? c.lastOrderAt.toISOString().slice(0, 10) : "",
  ]);
  // Punto y coma: Excel en español lo abre en columnas. BOM para los acentos.
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${tenant.slug}-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}


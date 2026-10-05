import { getTenant } from "@/server/tenant";
import { getCurrentUser } from "@/server/auth/session";
import { isTenantAdmin, resolveAccess } from "@/server/auth/guards";
import { getSalesLines } from "@/server/queries/reports";
import { centsToDecimalString, toCents } from "@/lib/money";
import { caracasDate, periodRange } from "@/lib/reports";

/** Ventas del periodo, una fila por prenda (Excel en español: punto y coma, coma decimal). El costo solo para la dueña. */
export async function GET(request: Request, { params }: RouteContext<"/t/[domain]/admin/reportes/exportar">) {
  const tenant = await getTenant((await params).domain);
  const user = await getCurrentUser();
  const access = user ? resolveAccess(user, tenant.id, ["TENANT_ADMIN", "BRANCH_ADMIN"]) : null;
  if (!access) return new Response("No autorizado", { status: 403 });
  const owner = isTenantAdmin(access);

  const sp = new URL(request.url).searchParams;
  const range = periodRange(sp.get("periodo") ?? undefined, new Date(), { desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined });
  const orders = await getSalesLines(tenant.id, range);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Evita fórmulas al abrir en Excel (inyección CSV).
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const num = (v: { toString(): string } | number) => centsToDecimalString(toCents(v)).replace(".", ",");
  const header = ["Fecha", "Pedido", "Canal", "Clienta", "Producto", "Categoría", "SKU", "Talla", "Color", "Cantidad", "Precio unit. USD", "Descuento USD", "Base USD", "IVA USD", "Total USD", "Tasa BCV"];
  if (owner) header.push("Costo unit. USD", "Utilidad USD");
  const rows = orders.flatMap((o) =>
    o.items.map((it) => {
      const row: unknown[] = [
        caracasDate(o.paidAt!),
        o.number,
        o.channel === "WEB" ? "Web" : "Tienda",
        o.customerName,
        it.productName,
        it.product?.category.name ?? "",
        it.sku ?? "",
        it.sizeLabel ?? "",
        it.colorName ?? "",
        it.quantity,
        num(it.unitPriceUsd),
        num(it.discountUsd),
        num(it.lineBaseUsd),
        num(it.lineIvaUsd),
        num(it.lineTotalUsd),
        String(Number(o.bcvRate)).replace(".", ","),
      ];
      if (owner) {
        const cost = it.product?.costUsd ? toCents(it.product.costUsd) : null;
        row.push(cost === null ? "" : num(cost / 100), cost === null ? "" : centsToDecimalString(toCents(it.lineBaseUsd) - cost * it.quantity).replace(".", ","));
      }
      return row;
    }),
  );
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${tenant.slug}-${caracasDate(range.from)}-a-${caracasDate(new Date(range.to.getTime() - 1))}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

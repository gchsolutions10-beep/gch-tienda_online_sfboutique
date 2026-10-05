import { tenantDb } from "@/server/db";
import { toCents } from "@/lib/money";
import { dailySeries, marginOf, previousRange, rankBy, slowMovers, vesRealValue, type Range, type SoldLine } from "@/lib/reports";
import type { PaymentMethod } from "@/lib/payments";
import type { Currency } from "@/lib/money";

/** Ventas = pedidos pagados (fecha de pago) en el periodo, sin los anulados. */
const soldIn = (r: Range) => ({ paidAt: { gte: r.from, lt: r.to }, status: { not: "CANCELLED" as const } });

/** Todo lo que muestra la pantalla de reportes para un periodo. */
export async function getReport(tenantId: string, range: Range) {
  const tdb = tenantDb(tenantId);
  const prev = previousRange(range);
  const [orders, previous, cancelled, payments, rates, newCustomers] = await Promise.all([
    tdb.order.findMany({
      where: soldIn(range),
      orderBy: { paidAt: "asc" },
      select: {
        id: true,
        channel: true,
        paidAt: true,
        customerId: true,
        totalUsd: true,
        ivaUsd: true,
        igtfUsd: true,
        discountUsd: true,
        shippingUsd: true,
        customer: { select: { firstOrderAt: true } },
        items: {
          select: {
            productId: true,
            productName: true,
            sizeLabel: true,
            colorName: true,
            quantity: true,
            lineBaseUsd: true,
            product: { select: { costUsd: true, category: { select: { name: true } } } },
          },
        },
      },
    }),
    tdb.order.aggregate({ where: soldIn(prev), _sum: { totalUsd: true }, _count: { _all: true } }),
    // Pagados que se anularon en el periodo (hubo que devolver el dinero).
    tdb.order.aggregate({ where: { status: "CANCELLED", paidAt: { not: null }, cancelledAt: { gte: range.from, lt: range.to } }, _sum: { totalUsd: true }, _count: { _all: true } }),
    tdb.payment.findMany({
      where: { status: "CONFIRMED", order: soldIn(range) },
      select: { method: true, currency: true, amount: true, amountUsd: true, amountVes: true, igtfAmount: true, createdAt: true },
    }),
    tdb.exchangeRate.findMany({ where: { effectiveAt: { lt: range.to } }, orderBy: { effectiveAt: "asc" }, select: { source: true, rate: true, effectiveAt: true } }),
    tdb.customer.count({ where: { firstOrderAt: { gte: range.from, lt: range.to } } }),
  ]);

  const lines: SoldLine[] = orders.flatMap((o) =>
    o.items.map((it) => ({
      productId: it.productId,
      name: it.productName,
      category: it.product?.category.name ?? null,
      size: it.sizeLabel,
      color: it.colorName,
      quantity: it.quantity,
      baseCents: toCents(it.lineBaseUsd),
      unitCostCents: it.product?.costUsd ? toCents(it.product.costUsd) : null,
    })),
  );

  const salesCents = orders.reduce((a, o) => a + toCents(o.totalUsd), 0);
  const byChannel = (["WEB", "STORE"] as const).map((channel) => {
    const list = orders.filter((o) => o.channel === channel);
    return { channel, count: list.length, cents: list.reduce((a, o) => a + toCents(o.totalUsd), 0) };
  });

  // Cobros por método, en su moneda original y su equivalente en USD.
  const methods = new Map<string, { method: PaymentMethod; currency: Currency; amount: number; usd: number; count: number }>();
  for (const p of payments) {
    const k = `${p.method}-${p.currency}`;
    const e = methods.get(k) ?? { method: p.method, currency: p.currency, amount: 0, usd: 0, count: 0 };
    e.amount += toCents(p.amount);
    e.usd += toCents(p.amountUsd);
    e.count += 1;
    methods.set(k, e);
  }

  const history = (source: "BCV" | "P2P") => rates.filter((r) => r.source === source).map((r) => ({ effectiveAt: r.effectiveAt, rate: Number(r.rate) }));
  const ves = vesRealValue(
    payments.filter((p) => p.currency === "VES").map((p) => ({ at: p.createdAt, vesCents: toCents(p.amountVes) })),
    history("P2P"),
    history("BCV"),
  );
  const withCustomer = orders.filter((o) => o.customerId);
  const returning = withCustomer.filter((o) => o.customer?.firstOrderAt && o.customer.firstOrderAt < range.from).length;

  return {
    salesCents,
    orders: orders.length,
    units: lines.reduce((a, l) => a + l.quantity, 0),
    avgTicketCents: orders.length ? Math.round(salesCents / orders.length) : 0,
    previous: { salesCents: toCents(previous._sum.totalUsd ?? 0), orders: previous._count._all },
    cancelled: { count: cancelled._count._all, cents: toCents(cancelled._sum.totalUsd ?? 0) },
    daily: dailySeries(range, orders.map((o) => ({ at: o.paidAt!, cents: toCents(o.totalUsd) }))),
    byChannel,
    byMethod: [...methods.values()].sort((a, b) => b.usd - a.usd),
    taxes: {
      ivaCents: orders.reduce((a, o) => a + toCents(o.ivaUsd), 0),
      igtfCents: orders.reduce((a, o) => a + toCents(o.igtfUsd), 0),
      discountCents: orders.reduce((a, o) => a + toCents(o.discountUsd), 0),
      shippingCents: orders.reduce((a, o) => a + toCents(o.shippingUsd), 0),
    },
    margin: marginOf(lines),
    topProducts: rankBy(lines, (l) => l.productId && l.name),
    byCategory: rankBy(lines, (l) => l.category, 12),
    bySize: rankBy(lines, (l) => l.size, 12),
    byColor: rankBy(lines, (l) => l.color, 12),
    ves,
    customers: { new: newCustomers, returningOrders: returning, identifiedOrders: withCustomer.length },
  };
}

/** Inventario hoy: valor al costo y a precio de venta, y prendas que no se mueven. */
export async function getInventoryReport(tenantId: string) {
  const tdb = tenantDb(tenantId);
  const [products, lastSales] = await Promise.all([
    tdb.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        createdAt: true,
        priceUsd: true,
        costUsd: true,
        category: { select: { name: true } },
        variants: { where: { isActive: true }, select: { stock: true, priceUsdOverride: true } },
      },
    }),
    tdb.$queryRaw<{ productId: string; lastSoldAt: Date }[]>`
      SELECT oi."productId", MAX(o."paidAt") AS "lastSoldAt"
      FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."tenantId" = ${tenantId} AND o."paidAt" IS NOT NULL AND o.status <> 'CANCELLED' AND oi."productId" IS NOT NULL
      GROUP BY oi."productId"`,
  ]);
  const last = new Map(lastSales.map((r) => [r.productId, r.lastSoldAt]));
  const items = products.map((p) => {
    const stock = p.variants.reduce((a, v) => a + Math.max(0, v.stock), 0);
    const retail = p.variants.reduce((a, v) => a + Math.max(0, v.stock) * toCents(v.priceUsdOverride ?? p.priceUsd), 0);
    return {
      id: p.id,
      name: p.name,
      category: p.category.name,
      stock,
      retailCents: retail,
      costCents: p.costUsd ? stock * toCents(p.costUsd) : null,
      lastSoldAt: last.get(p.id) ?? null,
      createdAt: p.createdAt,
    };
  });
  return {
    units: items.reduce((a, i) => a + i.stock, 0),
    retailCents: items.reduce((a, i) => a + i.retailCents, 0),
    costCents: items.reduce((a, i) => a + (i.costCents ?? 0), 0),
    withoutCost: items.filter((i) => i.stock > 0 && i.costCents === null).length,
    slow: slowMovers(items).slice(0, 10),
  };
}

/** Detalle de lo vendido (una fila por prenda) para exportar a Excel. */
export async function getSalesLines(tenantId: string, range: Range) {
  return tenantDb(tenantId).order.findMany({
    where: soldIn(range),
    orderBy: { paidAt: "asc" },
    select: {
      number: true,
      channel: true,
      paidAt: true,
      customerName: true,
      bcvRate: true,
      items: {
        select: {
          productName: true,
          sku: true,
          sizeLabel: true,
          colorName: true,
          quantity: true,
          unitPriceUsd: true,
          discountUsd: true,
          lineBaseUsd: true,
          lineIvaUsd: true,
          lineTotalUsd: true,
          product: { select: { costUsd: true, category: { select: { name: true } } } },
        },
      },
    },
  });
}

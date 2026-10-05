import type { Currency, PaymentMethod } from "@/generated/prisma/enums";
import { tenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { getDeliverySettings, OrderError, refreshCustomerStats, type Actor } from "@/server/services/orders";
import { centsToDecimalString, formatMoney, toCents } from "@/lib/money";
import { PAYMENT_METHODS, paymentAmounts } from "@/lib/payments";
import { priceOrder } from "@/lib/orders";
import { expectedByAccount, isCashAccount, splitDiscount, tenderStatus, type OpeningFloat } from "@/lib/cash";

const money = centsToDecimalString;

/** Turno abierto de una caja (o null). */
export async function getOpenSession(tenantId: string, registerId: string) {
  return tenantDb(tenantId).cashSession.findFirst({
    where: { registerId, status: "OPEN" },
    select: { id: true, openedAt: true, openingFloat: true, openedBy: { select: { name: true, email: true } } },
  });
}

export const parseFloat_ = (json: unknown): OpeningFloat => {
  const out: OpeningFloat = {};
  if (json && typeof json === "object") {
    for (const [k, v] of Object.entries(json)) if (k === "VES" || k === "USD" || k === "USDT") out[k] = toCents(String(v));
  }
  return out;
};

export async function openSession(tenantId: string, registerId: string, float: OpeningFloat, actor: NonNullable<Actor>) {
  const tdb = tenantDb(tenantId);
  const register = await tdb.cashRegister.findFirst({ where: { id: registerId, isActive: true }, select: { id: true } });
  if (!register) throw new OrderError("Caja no encontrada.");
  if (await getOpenSession(tenantId, registerId)) throw new OrderError("Esta caja ya tiene un turno abierto.");
  return tdb.cashSession.create({
    data: {
      tenantId,
      registerId,
      openedById: actor.id,
      openingFloat: Object.fromEntries(Object.entries(float).map(([k, v]) => [k, money(v ?? 0)])),
    },
    select: { id: true },
  });
}

async function requireOpen(tenantId: string, sessionId: string) {
  const s = await tenantDb(tenantId).cashSession.findFirst({ where: { id: sessionId }, select: { id: true, status: true, register: { select: { branchId: true } } } });
  if (!s) throw new OrderError("Turno no encontrado.");
  if (s.status !== "OPEN") throw new OrderError("El turno ya está cerrado.");
  return s;
}

export type StoreSaleInput = {
  lines: { variantId: string; quantity: number }[];
  discountCents: number;
  customerId: string | null;
  payments: { method: PaymentMethod; accountId: string; cents: number; reference: string | null }[];
  /** Moneda en que se entrega el vuelto (si sobra) */
  changeCurrency: Currency;
  notes: string | null;
};

/**
 * Venta en la tienda física: descuenta el stock al momento, registra cada
 * pago en su moneda y cuenta, y el vuelto como salida de efectivo.
 */
export async function createStoreSale(tenantId: string, sessionId: string, input: StoreSaleInput, actor: NonNullable<Actor>) {
  const tdb = tenantDb(tenantId);
  const session = await requireOpen(tenantId, sessionId);
  const [settings, rates] = await Promise.all([getDeliverySettings(tenantId), getCurrentRates(tenantId)]);
  if (!rates.bcv) throw new OrderError("Carga la tasa BCV del día antes de vender.");
  const bcv = rates.bcv.rate;

  const variants = await tdb.productVariant.findMany({
    where: { id: { in: input.lines.map((l) => l.variantId) }, isActive: true },
    select: {
      id: true,
      sku: true,
      stock: true,
      reserved: true,
      priceUsdOverride: true,
      size: { select: { label: true } },
      color: { select: { name: true } },
      product: { select: { id: true, name: true, priceUsd: true, ivaExempt: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines = input.lines.map((l) => {
    const v = byId.get(l.variantId);
    if (!v) throw new OrderError("Un producto de la venta ya no existe.");
    if (v.stock - v.reserved < l.quantity) throw new OrderError(`No hay suficiente ${v.product.name} ${[v.size?.label, v.color?.name].filter(Boolean).join(" ")} (quedan ${Math.max(0, v.stock - v.reserved)}).`);
    return { ...l, v, unitPriceCents: toCents(v.priceUsdOverride ?? v.product.priceUsd) };
  });
  const discounts = splitDiscount(lines.map((l) => l.unitPriceCents * l.quantity), input.discountCents);
  const t = priceOrder(
    lines.map((l, i) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, ivaExempt: l.v.product.ivaExempt, discountCents: discounts[i] })),
    settings.tax,
    0,
    bcv,
  );

  // Cuentas de los pagos (y su moneda).
  const accounts = await tdb.financialAccount.findMany({ where: { isActive: true }, select: { id: true, type: true, currency: true, name: true } });
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const payments = input.payments.map((p) => {
    const a = accountById.get(p.accountId);
    const method = PAYMENT_METHODS[p.method];
    if (!a || !method.accountTypes.includes(a.type)) throw new OrderError(`Elige la cuenta del pago con ${method.label}.`);
    if (method.needsReference && !p.reference && !isCashAccount(a.type)) throw new OrderError(`Falta la referencia del pago con ${method.label}.`);
    return { ...p, currency: a.currency };
  });
  const tender = tenderStatus(t.totalCents, payments.map((p) => ({ currency: p.currency, cents: p.cents })), bcv, input.changeCurrency);
  if (!tender.complete) throw new OrderError("Los pagos no cubren el total.");
  const changeAccount = tender.change > 0 ? accounts.find((a) => isCashAccount(a.type) && a.currency === input.changeCurrency) : null;
  if (tender.change > 0 && !changeAccount) throw new OrderError(`No hay una caja de efectivo en ${input.changeCurrency} para dar el vuelto.`);
  if (changeAccount) {
    // El vuelto sale del efectivo de la caja: no puede ser más de lo que hay (contando lo que entra en esta venta).
    const summary = await sessionSummary(tenantId, sessionId);
    const inDrawer = summary?.expected.find((l) => l.accountId === changeAccount.id)?.expected ?? 0;
    const incoming = payments.filter((p) => p.accountId === changeAccount.id).reduce((a, p) => a + p.cents, 0);
    if (tender.change > inDrawer + incoming) {
      const other = input.changeCurrency === "VES" ? "dólares" : "bolívares";
      throw new OrderError(`No alcanza el efectivo para el vuelto: hay ${formatMoney(inDrawer + incoming, changeAccount.currency)} en ${changeAccount.name}. Prueba darlo en ${other} o cobra el monto exacto.`);
    }
  }

  const customer = input.customerId ? await tdb.customer.findFirst({ where: { id: input.customerId }, select: { id: true, firstName: true, lastName: true, idType: true, idNumber: true, phone: true, email: true } }) : null;
  const now = new Date();

  return tdb.$transaction(async (tx) => {
    for (const l of lines) {
      const [row] = await tx.$queryRaw<{ stock: number }[]>`
        UPDATE product_variants SET stock = stock - ${l.quantity}
        WHERE id = ${l.v.id} AND "tenantId" = ${tenantId} AND stock - reserved >= ${l.quantity} RETURNING stock`;
      if (!row) throw new OrderError(`Se acaba de vender ${l.v.product.name}. Revisa la venta.`);
      l.v.stock = row.stock;
    }
    const counter = await tx.tenantSettings.update({ where: { tenantId }, data: { nextOrderNumber: { increment: 1 } }, select: { nextOrderNumber: true } });
    const order = await tx.order.create({
      data: {
        tenantId,
        branchId: session.register.branchId,
        number: counter.nextOrderNumber - 1,
        channel: "STORE",
        status: "DELIVERED",
        paymentStatus: "PAID",
        fulfillment: "PICKUP",
        customerId: customer?.id ?? null,
        customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "Cliente de mostrador",
        customerIdType: customer?.idType ?? null,
        customerIdNumber: customer?.idNumber ?? null,
        customerPhone: customer?.phone ?? null,
        customerEmail: customer?.email ?? null,
        subtotalUsd: money(t.subtotalCents),
        discountUsd: money(t.discountCents),
        taxableUsd: money(t.taxableCents),
        exemptUsd: money(t.exemptCents),
        ivaRate: (settings.tax.ivaEnabled ? settings.tax.ivaRateBp / 10_000 : 0).toFixed(4),
        ivaUsd: money(t.ivaCents),
        totalUsd: money(t.totalCents),
        bcvRate: String(bcv),
        totalVes: money(t.totalVesCents),
        paidUsd: money(t.totalCents),
        notes: input.notes,
        createdById: actor.id,
        cashSessionId: sessionId,
        paidAt: now,
        deliveredAt: now,
        items: {
          create: lines.map((l, i) => ({
            productId: l.v.product.id,
            variantId: l.v.id,
            productName: l.v.product.name,
            sku: l.v.sku,
            sizeLabel: l.v.size?.label ?? null,
            colorName: l.v.color?.name ?? null,
            quantity: l.quantity,
            unitPriceUsd: money(l.unitPriceCents),
            discountUsd: money(discounts[i]),
            ivaRate: (t.lines[i].ivaRateBp / 10_000).toFixed(4),
            lineBaseUsd: money(t.lines[i].baseCents),
            lineIvaUsd: money(t.lines[i].ivaCents),
            lineTotalUsd: money(t.lines[i].totalCents),
          })),
        },
        events: { create: { toStatus: "DELIVERED", note: "Venta en tienda", userId: actor.id, userName: actor.name } },
      },
      select: { id: true, number: true },
    });
    for (const l of lines) {
      await tx.stockMovement.create({
        data: { tenantId, variantId: l.v.id, type: "SALE", quantity: -l.quantity, stockAfter: l.v.stock, orderId: order.id, userId: actor.id },
      });
    }
    for (const p of payments) {
      const amounts = paymentAmounts(p.currency, p.cents, { bcv, p2p: rates.p2p?.rate ?? null });
      await tx.payment.create({
        data: {
          tenantId,
          orderId: order.id,
          method: p.method,
          status: "CONFIRMED",
          currency: p.currency,
          amount: money(p.cents),
          rate: String(amounts.rate),
          rateSource: amounts.rateSource,
          amountUsd: money(amounts.amountUsdCents),
          amountVes: money(amounts.amountVesCents),
          financialAccountId: p.accountId,
          reference: p.reference,
          reviewedById: actor.id,
          reviewedAt: now,
          cashSessionId: sessionId,
        },
      });
    }
    if (changeAccount) {
      await tx.cashMovement.create({
        data: {
          sessionId,
          type: "PAY_OUT",
          currency: changeAccount.currency,
          amount: money(tender.change),
          financialAccountId: changeAccount.id,
          reason: `Vuelto de la venta #${order.number}`,
          createdById: actor.id,
          orderId: order.id,
        },
      });
    }
    await refreshCustomerStats(tx, customer?.id ?? null);
    return { id: order.id, number: order.number, change: tender.change, changeCurrency: input.changeCurrency };
  });
}

/** Entrada o salida de efectivo fuera de una venta (pago a proveedor, cambio de billetes…). */
export async function addCashMovement(
  tenantId: string,
  sessionId: string,
  m: { type: "PAY_IN" | "PAY_OUT"; accountId: string; cents: number; reason: string },
  actor: NonNullable<Actor>,
) {
  await requireOpen(tenantId, sessionId);
  const tdb = tenantDb(tenantId);
  const account = await tdb.financialAccount.findFirst({ where: { id: m.accountId, isActive: true }, select: { id: true, type: true, currency: true } });
  if (!account || !isCashAccount(account.type)) throw new OrderError("Elige una caja de efectivo.");
  await tdb.cashMovement.create({
    data: { sessionId, type: m.type, currency: account.currency, amount: money(m.cents), financialAccountId: account.id, reason: m.reason, createdById: actor.id },
  });
}

/** Resumen del turno: ventas, pagos por método y lo esperado en cada cuenta. */
export async function sessionSummary(tenantId: string, sessionId: string) {
  const tdb = tenantDb(tenantId);
  const session = await tdb.cashSession.findFirst({
    where: { id: sessionId },
    include: {
      openedBy: { select: { name: true, email: true } },
      closedBy: { select: { name: true, email: true } },
      register: { select: { name: true } },
      payments: { where: { status: "CONFIRMED" }, select: { financialAccountId: true, currency: true, amount: true, amountUsd: true, method: true } },
      movements: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, currency: true, amount: true, financialAccountId: true, reason: true, createdAt: true } },
      orders: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, totalUsd: true, totalVes: true, customerName: true, createdAt: true } },
      lines: { include: { financialAccount: { select: { name: true, type: true } } } },
    },
  });
  if (!session) return null;
  const accounts = await tdb.financialAccount.findMany({ where: { OR: [{ isActive: true }, { id: { in: session.payments.map((p) => p.financialAccountId).filter((x): x is string => Boolean(x)) } }] }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true, currency: true } });
  const expected = expectedByAccount(
    accounts,
    parseFloat_(session.openingFloat),
    session.payments.map((p) => ({ financialAccountId: p.financialAccountId, currency: p.currency, cents: toCents(p.amount) })),
    session.movements.map((m) => ({ financialAccountId: m.financialAccountId, currency: m.currency, type: m.type, cents: toCents(m.amount) })),
  );
  const salesUsd = session.orders.reduce((a, o) => a + toCents(o.totalUsd), 0);
  const salesVes = session.orders.reduce((a, o) => a + toCents(o.totalVes), 0);
  return { session, expected, salesUsd, salesVes };
}

/** Cierra el turno con lo contado en cada cuenta y guarda las diferencias. */
export async function closeSession(tenantId: string, sessionId: string, counted: Record<string, number>, notes: string | null, actor: NonNullable<Actor>) {
  await requireOpen(tenantId, sessionId);
  const summary = await sessionSummary(tenantId, sessionId);
  if (!summary) throw new OrderError("Turno no encontrado.");
  const rates = await getCurrentRates(tenantId);
  const bcv = rates.bcv?.rate ?? 0;
  const tdb = tenantDb(tenantId);
  await tdb.$transaction(async (tx) => {
    const claimed = await tx.cashSession.updateMany({ where: { id: sessionId, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(), closedById: actor.id, notes } });
    if (!claimed.count) throw new OrderError("El turno ya se cerró.");
    for (const l of summary.expected) {
      const count = counted[l.accountId] ?? l.expected;
      const usd = l.currency === "VES" ? (bcv ? Math.round(l.expected / bcv) : 0) : l.expected;
      await tx.cashClosingLine.create({
        data: {
          sessionId,
          financialAccountId: l.accountId,
          currency: l.currency,
          expected: money(l.expected),
          counted: money(count),
          difference: money(count - l.expected),
          expectedUsd: money(usd),
          expectedVes: money(l.currency === "VES" ? l.expected : Math.round(l.expected * bcv)),
        },
      });
    }
  });
}

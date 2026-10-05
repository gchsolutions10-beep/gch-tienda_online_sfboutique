import { Prisma } from "@/generated/prisma/client";
import type { Currency, OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import { db, tenantDb, type TenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { centsToDecimalString, toCents } from "@/lib/money";
import { rateToBp } from "@/lib/tax-ve";
import { paymentAmounts } from "@/lib/payments";
import { favoriteMethod } from "@/lib/crm";
import { isFullyPaid, nextStatus, priceOrder, shippingFor, UNPAID_STATUSES, type Fulfillment } from "@/lib/orders";

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
const money = centsToDecimalString;

/** Error con mensaje para mostrar a la persona (se devuelve como { ok: false }). */
export class OrderError extends Error {}

export type Actor = { id: string; name: string | null } | null;

export async function getDeliverySettings(tenantId: string) {
  const s = await tenantDb(tenantId).tenantSettings.findFirst();
  return {
    pickupEnabled: s?.pickupEnabled ?? true,
    pickupInfo: s?.pickupInfo ?? null,
    localDeliveryEnabled: s?.localDeliveryEnabled ?? false,
    localDeliveryCents: s?.localDeliveryUsd ? toCents(s.localDeliveryUsd) : null,
    localDeliveryArea: s?.localDeliveryArea ?? null,
    nationalShippingEnabled: s?.nationalShippingEnabled ?? false,
    nationalShippingCents: s?.nationalShippingUsd ? toCents(s.nationalShippingUsd) : null,
    freeShippingFromCents: s?.freeShippingFromUsd ? toCents(s.freeShippingFromUsd) : null,
    reservationHours: s?.reservationHours ?? 24,
    tax: {
      ivaEnabled: s?.ivaEnabled ?? true,
      ivaRateBp: rateToBp(s?.ivaRate ?? 0.16),
      taxMode: s?.taxMode ?? "PRICE_INCLUDES_TAX",
    },
  };
}

/**
 * Anula los pedidos web sin pago cuya reserva venció y libera el stock
 * apartado. Se llama al abrir el checkout y la lista de pedidos (no hace falta un cron).
 */
export async function releaseExpiredReservations(tenantId: string) {
  const tdb = tenantDb(tenantId);
  const expired = await tdb.order.findMany({
    where: { status: "PENDING", reservedUntil: { lt: new Date() } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of expired) {
    await tdb.$transaction(async (tx) => {
      // Solo si sigue PENDING (otra petición pudo haberlo cambiado).
      const claimed = await tx.order.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Venció la reserva sin pago", reservedUntil: null },
      });
      if (!claimed.count) return;
      await releaseReservation(tx, tenantId, id);
      await tx.orderEvent.create({ data: { orderId: id, fromStatus: "PENDING", toStatus: "CANCELLED", note: "Venció la reserva sin pago: se liberó el stock apartado" } });
    });
  }
}

async function releaseReservation(tx: Tx, tenantId: string, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
  for (const it of items) {
    await tx.$executeRaw`UPDATE product_variants SET reserved = GREATEST(reserved - ${it.quantity}, 0) WHERE id = ${it.variantId} AND "tenantId" = ${tenantId}`;
  }
}

/** Descuenta del stock lo vendido (y lo saca de lo apartado). */
async function commitStock(tx: Tx, tenantId: string, orderId: string, actor: Actor) {
  const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
  for (const it of items) {
    const [row] = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE product_variants SET stock = stock - ${it.quantity}, reserved = GREATEST(reserved - ${it.quantity}, 0)
      WHERE id = ${it.variantId} AND "tenantId" = ${tenantId} RETURNING stock`;
    if (row) {
      await tx.stockMovement.create({
        data: { tenantId, variantId: it.variantId!, type: "SALE", quantity: -it.quantity, stockAfter: row.stock, orderId, userId: actor?.id ?? null },
      });
    }
  }
}

/** Devuelve al stock lo de un pedido pagado que se anula. */
async function returnStock(tx: Tx, tenantId: string, orderId: string, actor: Actor) {
  const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
  for (const it of items) {
    const [row] = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE product_variants SET stock = stock + ${it.quantity} WHERE id = ${it.variantId} AND "tenantId" = ${tenantId} RETURNING stock`;
    if (row) {
      await tx.stockMovement.create({
        data: { tenantId, variantId: it.variantId!, type: "RETURN", quantity: it.quantity, stockAfter: row.stock, orderId, reason: "Pedido anulado", userId: actor?.id ?? null },
      });
    }
  }
}

/** Recalcula las métricas del cliente con sus pedidos pagados y no anulados. */
async function refreshCustomerStats(tx: Tx, customerId: string | null) {
  if (!customerId) return;
  const orders = await tx.order.findMany({
    where: { customerId, paidAt: { not: null }, status: { not: "CANCELLED" } },
    select: { totalUsd: true, totalVes: true, paidAt: true, payments: { where: { status: "CONFIRMED" }, select: { method: true } } },
    orderBy: { paidAt: "asc" },
  });
  await tx.customer.update({
    where: { id: customerId },
    data: {
      ordersCount: orders.length,
      totalSpentUsd: money(orders.reduce((a, o) => a + toCents(o.totalUsd), 0)),
      totalSpentVes: money(orders.reduce((a, o) => a + toCents(o.totalVes), 0)),
      firstOrderAt: orders[0]?.paidAt ?? null,
      lastOrderAt: orders.at(-1)?.paidAt ?? null,
      favoritePaymentMethod: favoriteMethod(orders.flatMap((o) => o.payments.map((p) => p.method))),
    },
  });
}

// ───────────────────────────── Checkout ─────────────────────────────

export type CheckoutLine = { variantId: string; quantity: number };

/** Precios, stock y totales reales (los de la bolsa son solo orientativos). */
export async function quoteLines(tenantId: string, lines: CheckoutLine[], fulfillment: Fulfillment) {
  const [settings, rates] = await Promise.all([getDeliverySettings(tenantId), getCurrentRates(tenantId)]);
  const ids = [...new Set(lines.map((l) => l.variantId))];
  const variants = await tenantDb(tenantId).productVariant.findMany({
    where: { id: { in: ids }, isActive: true, product: { isActive: true, publishedAt: { lte: new Date() } } },
    select: {
      id: true,
      sku: true,
      stock: true,
      reserved: true,
      priceUsdOverride: true,
      size: { select: { label: true } },
      color: { select: { name: true } },
      product: { select: { id: true, name: true, slug: true, priceUsd: true, ivaExempt: true, freeShipping: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const priced = lines.map((l) => {
    const v = byId.get(l.variantId);
    if (!v) return { line: l, variant: null, available: 0, unitPriceCents: 0 };
    return {
      line: l,
      variant: v,
      available: Math.max(0, v.stock - v.reserved),
      unitPriceCents: toCents(v.priceUsdOverride ?? v.product.priceUsd),
    };
  });
  const ok = priced.filter((p) => p.variant && p.available > 0);
  const subtotal = ok.reduce((a, p) => a + p.unitPriceCents * Math.min(p.line.quantity, p.available), 0);
  const allFree = ok.length > 0 && ok.every((p) => p.variant!.product.freeShipping);
  const shipping = shippingFor(fulfillment, subtotal, allFree, settings);
  const bcv = rates.bcv?.rate ?? null;
  const totals = bcv
    ? priceOrder(
        ok.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: Math.min(p.line.quantity, p.available), ivaExempt: p.variant!.product.ivaExempt })),
        settings.tax,
        shipping.cents,
        bcv,
      )
    : null;
  return { settings, bcv, priced, shipping, totals };
}

export type CreateWebOrderInput = {
  idempotencyKey: string;
  lines: CheckoutLine[];
  fulfillment: Fulfillment;
  customer: { name: string; idType: "V" | "E" | "J" | "G" | "P" | "C" | null; idNumber: string | null; phone: string; email: string | null };
  shipping: { state: string | null; city: string | null; address: string | null; reference: string | null; carrier: string | null; office: string | null };
  notes: string | null;
};

/**
 * Crea el pedido web y APARTA el stock (reserved) por unas horas. El stock se
 * descuenta de verdad al confirmar el pago; si no paga a tiempo, se libera.
 */
export async function createWebOrder(tenantId: string, input: CreateWebOrderInput) {
  const tdb = tenantDb(tenantId);
  const existing = await tdb.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { trackingToken: true, number: true } });
  if (existing) return existing;

  await releaseExpiredReservations(tenantId);
  const q = await quoteLines(tenantId, input.lines, input.fulfillment);
  if (!q.bcv || !q.totals) throw new OrderError("La tienda todavía no cargó la tasa del día. Escríbenos por WhatsApp para completar tu compra.");
  if (!q.shipping.available) throw new OrderError("Esa forma de entrega no está disponible.");
  for (const p of q.priced) {
    if (!p.variant) throw new OrderError("Uno de los productos de tu bolsa ya no está disponible. Revisa tu bolsa.");
    if (p.available < p.line.quantity) {
      const what = [p.variant.product.name, p.variant.size && `talla ${p.variant.size.label}`, p.variant.color?.name].filter(Boolean).join(" · ");
      throw new OrderError(p.available ? `Solo ${p.available === 1 ? "queda 1" : `quedan ${p.available}`} de ${what}.` : `Se agotó ${what}.`);
    }
  }
  const t = q.totals;
  const [firstName, ...rest] = input.customer.name.trim().split(/\s+/);
  const reservedUntil = new Date(Date.now() + q.settings.reservationHours * 3_600_000);

  try {
    return await tdb.$transaction(async (tx) => {
      // Aparta cada variante solo si todavía alcanza (atómico: evita vender dos veces la última unidad).
      for (const p of q.priced) {
        const n = await tx.$executeRaw`
          UPDATE product_variants SET reserved = reserved + ${p.line.quantity}
          WHERE id = ${p.variant!.id} AND "tenantId" = ${tenantId} AND stock - reserved >= ${p.line.quantity}`;
        if (!n) throw new OrderError(`Alguien acaba de llevarse ${p.variant!.product.name}. Revisa tu bolsa.`);
      }
      const counter = await tx.tenantSettings.update({ where: { tenantId }, data: { nextOrderNumber: { increment: 1 } }, select: { nextOrderNumber: true } });
      const customer = await tx.customer.upsert({
        where: { tenantId_phone: { tenantId, phone: input.customer.phone } },
        update: {
          ...(input.customer.idNumber ? { idType: input.customer.idType, idNumber: input.customer.idNumber } : {}),
          ...(input.customer.email ? { email: input.customer.email } : {}),
          whatsapp: input.customer.phone,
        },
        create: {
          tenantId,
          firstName,
          lastName: rest.join(" ") || null,
          idType: input.customer.idType,
          idNumber: input.customer.idNumber,
          phone: input.customer.phone,
          whatsapp: input.customer.phone,
          email: input.customer.email,
          source: "WEB",
        },
        select: { id: true },
      });
      const national = input.fulfillment === "NATIONAL_SHIPPING";
      const delivery = input.fulfillment !== "PICKUP";
      return tx.order.create({
        data: {
          tenantId,
          number: counter.nextOrderNumber - 1,
          idempotencyKey: input.idempotencyKey,
          channel: "WEB",
          fulfillment: input.fulfillment,
          customerId: customer.id,
          customerName: input.customer.name.trim(),
          customerIdType: input.customer.idType,
          customerIdNumber: input.customer.idNumber,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          shippingState: national ? input.shipping.state : null,
          shippingCity: delivery ? input.shipping.city : null,
          shippingAddress: delivery ? input.shipping.address : null,
          shippingRef: delivery ? input.shipping.reference : null,
          carrier: national ? input.shipping.carrier : null,
          carrierOffice: national ? input.shipping.office : null,
          subtotalUsd: money(t.subtotalCents),
          taxableUsd: money(t.taxableCents),
          exemptUsd: money(t.exemptCents),
          ivaRate: (q.settings.tax.ivaEnabled ? q.settings.tax.ivaRateBp / 10_000 : 0).toFixed(4),
          ivaUsd: money(t.ivaCents),
          shippingUsd: money(t.shippingCents),
          totalUsd: money(t.totalCents),
          bcvRate: String(q.bcv),
          totalVes: money(t.totalVesCents),
          notes: input.notes,
          reservedUntil,
          termsAcceptedAt: new Date(),
          items: {
            create: q.priced.map((p, i) => ({
              productId: p.variant!.product.id,
              variantId: p.variant!.id,
              productName: p.variant!.product.name,
              sku: p.variant!.sku,
              sizeLabel: p.variant!.size?.label ?? null,
              colorName: p.variant!.color?.name ?? null,
              quantity: p.line.quantity,
              unitPriceUsd: money(p.unitPriceCents),
              ivaRate: (t.lines[i].ivaRateBp / 10_000).toFixed(4),
              lineBaseUsd: money(t.lines[i].baseCents),
              lineIvaUsd: money(t.lines[i].ivaCents),
              lineTotalUsd: money(t.lines[i].totalCents),
            })),
          },
          events: {
            create: {
              toStatus: "PENDING",
              note: `Pedido web. Stock apartado hasta el ${reservedUntil.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })}`,
            },
          },
        },
        select: { trackingToken: true, number: true },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await tdb.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { trackingToken: true, number: true } });
      if (again) return again;
    }
    throw error;
  }
}

// ───────────────────────────── Pagos ─────────────────────────────

export type PaymentInput = {
  method: PaymentMethod;
  currency: Currency;
  amountCents: number;
  financialAccountId: string | null;
  reference: string | null;
  payerName: string | null;
  payerIdNumber: string | null;
  payerPhone: string | null;
  payerBank: string | null;
};

async function rateForPayment(tenantId: string) {
  const rates = await getCurrentRates(tenantId);
  if (!rates.bcv) throw new OrderError("No hay tasa BCV cargada para convertir el pago.");
  return { bcv: rates.bcv.rate, p2p: rates.p2p?.rate ?? null };
}

async function checkAccount(tx: Tx, accountId: string | null, currency: Currency) {
  if (!accountId) return;
  const account = await tx.financialAccount.findFirst({ where: { id: accountId, isActive: true }, select: { currency: true } });
  if (!account) throw new OrderError("Esa cuenta no existe.");
  if (account.currency !== currency) throw new OrderError("La moneda del pago no coincide con la de la cuenta.");
}

/** La clienta reporta su pago (queda por verificar). Devuelve el id para adjuntar el comprobante. */
export async function reportPayment(tenantId: string, trackingToken: string, p: PaymentInput) {
  const tdb = tenantDb(tenantId);
  const rates = await rateForPayment(tenantId);
  const amounts = paymentAmounts(p.currency, p.amountCents, rates);
  return tdb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { trackingToken }, select: { id: true, status: true } });
    if (!order) throw new OrderError("Pedido no encontrado.");
    if (!UNPAID_STATUSES.includes(order.status)) throw new OrderError("Este pedido ya no espera pagos.");
    await checkAccount(tx, p.financialAccountId, p.currency);
    const payment = await tx.payment.create({
      data: {
        tenantId,
        orderId: order.id,
        method: p.method,
        status: "PENDING_REVIEW",
        currency: p.currency,
        amount: money(p.amountCents),
        rate: String(amounts.rate),
        rateSource: amounts.rateSource,
        amountUsd: money(amounts.amountUsdCents),
        amountVes: money(amounts.amountVesCents),
        financialAccountId: p.financialAccountId,
        reference: p.reference,
        payerName: p.payerName,
        payerIdNumber: p.payerIdNumber,
        payerPhone: p.payerPhone,
        payerBank: p.payerBank,
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "PAYMENT_REVIEW" } });
    await tx.orderEvent.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: "PAYMENT_REVIEW", note: `La clienta reportó un pago${p.reference ? ` (ref. ${p.reference})` : ""}` },
    });
    return payment;
  });
}

/** Guarda la captura del comprobante (privada: solo la ve el personal). */
export async function saveProof(tenantId: string, paymentId: string, data: Uint8Array<ArrayBuffer>, mimeType: string) {
  const key = `comprobante-${paymentId}`;
  await db.$transaction([
    db.tenantAsset.upsert({
      where: { tenantId_kind: { tenantId, kind: key } },
      update: { mimeType, sizeBytes: data.byteLength, data },
      create: { tenantId, kind: key, mimeType, sizeBytes: data.byteLength, data },
    }),
    db.payment.updateMany({ where: { id: paymentId, tenantId }, data: { proofKey: key } }),
  ]);
}

/** Suma lo confirmado y, si cubre el total, marca el pedido pagado y descuenta el stock. */
async function settle(tx: Tx, tenantId: string, orderId: string, actor: Actor) {
  const order = await tx.order.findFirstOrThrow({
    where: { id: orderId },
    select: { status: true, totalUsd: true, customerId: true, payments: { where: { status: "CONFIRMED" }, select: { amountUsd: true } } },
  });
  const paid = order.payments.reduce((a, p) => a + toCents(p.amountUsd), 0);
  const total = toCents(order.totalUsd);
  const full = isFullyPaid(total, paid);
  const wasUnpaid = UNPAID_STATUSES.includes(order.status);
  const pending = await tx.payment.count({ where: { orderId, status: "PENDING_REVIEW" } });

  let status: OrderStatus = order.status;
  if (wasUnpaid) status = full ? "PAID" : pending ? "PAYMENT_REVIEW" : "PENDING";
  await tx.order.update({
    where: { id: orderId },
    data: {
      paidUsd: money(paid),
      paymentStatus: paid <= 0 ? "UNPAID" : full ? "PAID" : "PARTIAL",
      status,
      ...(wasUnpaid && full ? { paidAt: new Date(), reservedUntil: null } : {}),
    },
  });
  if (wasUnpaid && full) {
    await commitStock(tx, tenantId, orderId, actor);
    await refreshCustomerStats(tx, order.customerId);
  }
  if (status !== order.status) {
    await tx.orderEvent.create({
      data: { orderId, fromStatus: order.status, toStatus: status, userId: actor?.id ?? null, userName: actor?.name ?? null, note: full ? "Pago completo: se descontó el stock" : null },
    });
  }
  return { full, paidCents: paid, totalCents: total };
}

/** El personal confirma (o rechaza) un pago reportado. */
export async function reviewPayment(tenantId: string, paymentId: string, approve: boolean, note: string | null, actor: Actor) {
  const tdb = tenantDb(tenantId);
  return tdb.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId }, select: { id: true, orderId: true, status: true, amount: true, currency: true, method: true } });
    if (!payment) throw new OrderError("Pago no encontrado.");
    if (payment.status !== "PENDING_REVIEW") throw new OrderError("Ese pago ya fue revisado.");
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: approve ? "CONFIRMED" : "REJECTED", reviewedById: actor?.id ?? null, reviewedAt: new Date(), reviewNote: note },
    });
    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        userId: actor?.id ?? null,
        userName: actor?.name ?? null,
        note: `${approve ? "Pago confirmado" : "Pago rechazado"}${note ? `: ${note}` : ""}`,
      },
    });
    const result = await settle(tx, tenantId, payment.orderId, actor);
    // Rechazado y sin otros pagos: vuelve a esperar pago con una reserva nueva.
    if (!approve) {
      const s = await tx.tenantSettings.findFirst({ select: { reservationHours: true } });
      await tx.order.updateMany({
        where: { id: payment.orderId, status: "PENDING" },
        data: { reservedUntil: new Date(Date.now() + (s?.reservationHours ?? 24) * 3_600_000) },
      });
    }
    return result;
  });
}

/** El personal registra un pago recibido directamente (WhatsApp, tienda): queda confirmado. */
export async function registerPayment(tenantId: string, orderId: string, p: PaymentInput, actor: Actor) {
  const tdb = tenantDb(tenantId);
  const rates = await rateForPayment(tenantId);
  const amounts = paymentAmounts(p.currency, p.amountCents, rates);
  return tdb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId }, select: { status: true } });
    if (!order) throw new OrderError("Pedido no encontrado.");
    if (order.status === "CANCELLED") throw new OrderError("El pedido está anulado.");
    await checkAccount(tx, p.financialAccountId, p.currency);
    await tx.payment.create({
      data: {
        tenantId,
        orderId,
        method: p.method,
        status: "CONFIRMED",
        currency: p.currency,
        amount: money(p.amountCents),
        rate: String(amounts.rate),
        rateSource: amounts.rateSource,
        amountUsd: money(amounts.amountUsdCents),
        amountVes: money(amounts.amountVesCents),
        financialAccountId: p.financialAccountId,
        reference: p.reference,
        payerName: p.payerName,
        reviewedById: actor?.id ?? null,
        reviewedAt: new Date(),
      },
    });
    await tx.orderEvent.create({ data: { orderId, userId: actor?.id ?? null, userName: actor?.name ?? null, note: "Pago registrado por el personal" } });
    return settle(tx, tenantId, orderId, actor);
  });
}

// ───────────────────────────── Estado ─────────────────────────────

/** Avanza al siguiente paso (Preparando → Listo/Enviado → Entregado). */
export async function advanceOrder(tenantId: string, orderId: string, to: OrderStatus, shipping: { carrier: string | null; trackingNumber: string | null }, actor: Actor) {
  const tdb = tenantDb(tenantId);
  return tdb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId }, select: { status: true, fulfillment: true, carrier: true } });
    if (!order) throw new OrderError("Pedido no encontrado.");
    if (nextStatus(order.status, order.fulfillment) !== to) throw new OrderError("El pedido cambió. Recarga la página.");
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: to,
        ...(to === "SHIPPED" ? { shippedAt: new Date(), carrier: shipping.carrier ?? order.carrier, trackingNumber: shipping.trackingNumber } : {}),
        ...(to === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
    });
    if (!claimed.count) throw new OrderError("El pedido cambió. Recarga la página.");
    await tx.orderEvent.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: to,
        userId: actor?.id ?? null,
        userName: actor?.name ?? null,
        note: to === "SHIPPED" && shipping.trackingNumber ? `Guía ${shipping.carrier ?? ""} ${shipping.trackingNumber}`.trim() : null,
      },
    });
  });
}

/**
 * Anula el pedido. Sin pago: libera lo apartado. Pagado (aún no entregado):
 * devuelve la mercancía al stock; el reembolso del dinero se hace aparte.
 */
export async function cancelOrder(tenantId: string, orderId: string, reason: string, actor: Actor) {
  const tdb = tenantDb(tenantId);
  return tdb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId }, select: { status: true, customerId: true, paidAt: true } });
    if (!order) throw new OrderError("Pedido no encontrado.");
    if (order.status === "CANCELLED" || order.status === "DELIVERED") throw new OrderError("Este pedido ya no se puede anular.");
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, reservedUntil: null },
    });
    if (!claimed.count) throw new OrderError("El pedido cambió. Recarga la página.");
    if (UNPAID_STATUSES.includes(order.status)) await releaseReservation(tx, tenantId, orderId);
    else await returnStock(tx, tenantId, orderId, actor);
    await tx.payment.updateMany({ where: { orderId, status: "PENDING_REVIEW" }, data: { status: "REJECTED", reviewNote: "Pedido anulado" } });
    await tx.orderEvent.create({
      data: { orderId, fromStatus: order.status, toStatus: "CANCELLED", userId: actor?.id ?? null, userName: actor?.name ?? null, note: reason },
    });
    if (order.paidAt) await refreshCustomerStats(tx, order.customerId);
    return { hadPayments: Boolean(order.paidAt) };
  });
}

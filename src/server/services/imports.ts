import { db, tenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { advanceOrder, getDeliverySettings, OrderError, type Actor } from "@/server/services/orders";
import { sendPushToCustomer } from "@/server/services/push";
import { centsToDecimalString, formatUsd, toCents, usdToVesCents } from "@/lib/money";
import { computeTaxes } from "@/lib/tax-ve";
import { mediaKey, mediaUrl } from "@/lib/media";
import { acceptingOrders, quoteFor, type BatchStatus } from "@/lib/imports";

const money = centsToDecimalString;

export async function getImportSettings(tenantId: string) {
  const s = await tenantDb(tenantId).tenantSettings.findFirst({ select: { importsEnabled: true, importDepositPct: true, importCommissionPct: true } });
  return { enabled: s?.importsEnabled ?? false, depositPct: s?.importDepositPct ?? 50, commissionPct: s?.importCommissionPct ?? 15 };
}

async function requireEnabled(tenantId: string) {
  const s = await getImportSettings(tenantId);
  if (!s.enabled) throw new OrderError("Las importaciones no están disponibles por ahora.");
  return s;
}

/** Lote abierto que recibe pedidos (el que cierra antes, si hay varios). */
export async function openBatch(tenantId: string, batchId?: string | null, now = new Date()) {
  const batches = await tenantDb(tenantId).importBatch.findMany({
    where: { status: "OPEN", ...(batchId ? { id: batchId } : {}) },
    orderBy: { closesAt: "asc" },
    select: { id: true, name: true, status: true, opensAt: true, closesAt: true },
  });
  return batches.find((b) => acceptingOrders(b, now)) ?? null;
}

// ───────────────────────────── Clienta ─────────────────────────────

export type NewRequest = {
  batchId: string | null;
  url: string;
  store: string;
  title: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  notes: string | null;
  isPrivate: boolean;
  photo: { data: Uint8Array<ArrayBuffer>; mime: string } | null;
};

/** Encargo con el enlace de la clienta: queda en revisión hasta que la tienda cotiza. */
export async function createImportRequest(tenantId: string, customerId: string, r: NewRequest) {
  await requireEnabled(tenantId);
  const batch = await openBatch(tenantId, r.batchId);
  if (!batch) throw new OrderError("No hay un lote abierto recibiendo pedidos en este momento.");
  return db.$transaction(async (tx) => {
    const created = await tx.importRequest.create({
      data: {
        tenantId,
        customerId,
        batchId: batch.id,
        sourceUrl: r.url,
        sourceStore: r.store,
        title: r.title,
        size: r.size,
        color: r.color,
        quantity: r.quantity,
        notes: r.notes,
        isPrivate: r.isPrivate,
        termsAcceptedAt: new Date(),
      },
      select: { id: true },
    });
    if (r.photo) {
      // Foto PRIVADA de la clienta: solo la ve el personal (no sale por /marca).
      const key = `encargo-${created.id}`;
      await tx.tenantAsset.create({ data: { tenantId, kind: key, mimeType: r.photo.mime, sizeBytes: r.photo.data.byteLength, data: r.photo.data } });
      await tx.importRequest.update({ where: { id: created.id }, data: { photoKey: key } });
    }
    return created;
  });
}

/** «Unirme al pedido»: se suma a un producto publicado del lote abierto. */
export async function joinImportProduct(tenantId: string, customerId: string, productId: string, p: { size: string | null; color: string | null; quantity: number; notes: string | null }) {
  await requireEnabled(tenantId);
  const tdb = tenantDb(tenantId);
  const product = await tdb.importProduct.findFirst({ where: { id: productId, isPublished: true }, select: { id: true, batchId: true, title: true, sourceUrl: true, sourceStore: true } });
  if (!product) throw new OrderError("Ese producto ya no está disponible.");
  const batch = await openBatch(tenantId, product.batchId);
  if (!batch) throw new OrderError("El lote de este producto ya no recibe pedidos.");
  const dup = await tdb.importRequest.findFirst({ where: { customerId, productId, status: { in: ["PENDING_REVIEW", "QUOTED"] }, size: p.size, color: p.color }, select: { id: true } });
  if (dup) throw new OrderError("Ya te sumaste a este producto con esa talla y color. Revisa «Mis encargos».");
  return tdb.importRequest.create({
    data: {
      tenantId,
      customerId,
      batchId: product.batchId,
      productId: product.id,
      sourceUrl: product.sourceUrl,
      sourceStore: product.sourceStore,
      title: product.title,
      size: p.size,
      color: p.color,
      quantity: p.quantity,
      notes: p.notes,
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  });
}

/**
 * La clienta acepta la cotización: se crea un PEDIDO normal (pagos, verificación,
 * factura y seguimiento de siempre) que se procesa con el adelanto.
 */
export async function acceptImportQuote(tenantId: string, customerId: string, requestId: string) {
  const settings = await requireEnabled(tenantId);
  const tdb = tenantDb(tenantId);
  const [rates, delivery] = await Promise.all([getCurrentRates(tenantId), getDeliverySettings(tenantId)]);
  if (!rates.bcv) throw new OrderError("La tienda aún no cargó la tasa del día. Escríbenos por WhatsApp.");
  const bcv = rates.bcv.rate;
  return tdb.$transaction(async (tx) => {
    const r = await tx.importRequest.findFirst({
      where: { id: requestId, customerId },
      include: { customer: { select: { firstName: true, lastName: true, idType: true, idNumber: true, phone: true, email: true } }, batch: { select: { name: true } } },
    });
    if (!r) throw new OrderError("Encargo no encontrado.");
    if (r.status !== "QUOTED" || !r.totalUsd || r.unitCostUsd === null || r.freightUsd === null || r.commissionUsd === null) throw new OrderError("Este encargo no tiene una cotización pendiente.");
    // Se recalcula con la configuración de impuestos de hoy y debe dar lo mismo que se le mostró.
    const q = quoteFor(
      { unitCostCents: toCents(r.unitCostUsd), quantity: r.quantity, freightCents: toCents(r.freightUsd), commissionCents: toCents(r.commissionUsd) },
      delivery.tax,
      settings.depositPct,
    );
    if (q.totalCents !== toCents(r.totalUsd)) throw new OrderError("La cotización cambió. Recarga la página para verla actualizada.");
    const t = computeTaxes(
      [
        { unitPriceCents: q.productsCents + q.freightCents, quantity: 1, exempt: true },
        { unitPriceCents: q.commissionCents, quantity: 1, exempt: false },
      ],
      delivery.tax,
    );
    const counter = await tx.tenantSettings.update({ where: { tenantId }, data: { nextOrderNumber: { increment: 1 } }, select: { nextOrderNumber: true } });
    const name = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ");
    const what = [r.title ?? `Producto de ${r.sourceStore}`, r.size && `talla ${r.size}`, r.color].filter(Boolean).join(" · ");
    const order = await tx.order.create({
      data: {
        tenantId,
        number: counter.nextOrderNumber - 1,
        channel: "WEB",
        fulfillment: "PICKUP",
        customerId,
        customerName: name,
        customerIdType: r.customer.idType,
        customerIdNumber: r.customer.idNumber,
        customerPhone: r.customer.phone,
        customerEmail: r.customer.email,
        subtotalUsd: money(q.totalCents),
        taxableUsd: money(t.taxableCents),
        exemptUsd: money(t.exemptCents),
        ivaRate: (delivery.tax.ivaEnabled ? delivery.tax.ivaRateBp / 10_000 : 0).toFixed(4),
        ivaUsd: money(t.ivaCents),
        totalUsd: money(q.totalCents),
        bcvRate: String(bcv),
        totalVes: money(usdToVesCents(q.totalCents, bcv)),
        termsAcceptedAt: new Date(),
        isImport: true,
        importDepositUsd: money(q.depositCents),
        notes: `Encargo (${r.batch?.name ?? "importación"}): ${r.sourceStore}`,
        items: {
          create: [
            {
              productName: `Encargo ${r.sourceStore}: ${what} × ${r.quantity}`,
              quantity: 1,
              unitPriceUsd: money(q.productsCents + q.freightCents),
              ivaRate: "0.0000",
              lineBaseUsd: money(t.lines[0].baseCents),
              lineIvaUsd: money(t.lines[0].ivaCents),
              lineTotalUsd: money(t.lines[0].totalCents),
            },
            {
              productName: "Servicio de gestión de compra e importación",
              quantity: 1,
              unitPriceUsd: money(q.commissionCents),
              ivaRate: (t.lines[1].ivaRateBp / 10_000).toFixed(4),
              lineBaseUsd: money(t.lines[1].baseCents),
              lineIvaUsd: money(t.lines[1].ivaCents),
              lineTotalUsd: money(t.lines[1].totalCents),
            },
          ],
        },
        events: { create: { toStatus: "PENDING", note: `Encargo aceptado. Adelanto ${formatUsd(q.depositCents)} (${settings.depositPct} %) para procesarlo` } },
      },
      select: { id: true, trackingToken: true, number: true },
    });
    const claimed = await tx.importRequest.updateMany({ where: { id: r.id, status: "QUOTED" }, data: { status: "ACCEPTED", orderId: order.id, acceptedAt: new Date() } });
    if (!claimed.count) throw new OrderError("El encargo cambió. Recarga la página.");
    return order;
  });
}

export async function cancelImportRequest(tenantId: string, customerId: string, requestId: string) {
  const r = await tenantDb(tenantId).importRequest.updateMany({ where: { id: requestId, customerId, status: { in: ["PENDING_REVIEW", "QUOTED"] } }, data: { status: "CANCELLED" } });
  if (!r.count) throw new OrderError("Este encargo ya no se puede cancelar.");
}

/** Reseña de un lote entregado: solo quien recibió un encargo de ese lote (la tienda la aprueba). */
export async function submitBatchReview(tenantId: string, customerId: string, batchId: string, rating: number, body: string) {
  const tdb = tenantDb(tenantId);
  const batch = await tdb.importBatch.findFirst({ where: { id: batchId, status: "DELIVERED" }, select: { id: true } });
  if (!batch) throw new OrderError("Este lote todavía no fue entregado.");
  const received = await tdb.importRequest.count({ where: { batchId, customerId, status: "ACCEPTED", order: { status: "DELIVERED" } } });
  if (!received) throw new OrderError("Solo pueden opinar quienes recibieron un encargo de este lote.");
  await tdb.importReview.upsert({
    where: { batchId_customerId: { batchId, customerId } },
    update: { rating, body, isApproved: false },
    create: { tenantId, batchId, customerId, rating, body },
  });
}

// ───────────────────────────── Tienda (panel) ─────────────────────────────

/** La tienda cotiza: productos + flete + comisión → total y adelanto. Avisa a la clienta. */
export async function quoteImportRequest(
  tenantId: string,
  requestId: string,
  p: { unitCostCents: number; freightCents: number; commissionCents: number; note: string | null; batchId: string | null },
  actor: NonNullable<Actor>,
) {
  const tdb = tenantDb(tenantId);
  const [settings, delivery] = await Promise.all([getImportSettings(tenantId), getDeliverySettings(tenantId)]);
  const r = await tdb.importRequest.findFirst({ where: { id: requestId }, select: { id: true, status: true, quantity: true, customerId: true, title: true, sourceStore: true } });
  if (!r) throw new OrderError("Encargo no encontrado.");
  if (r.status !== "PENDING_REVIEW" && r.status !== "QUOTED") throw new OrderError("Este encargo ya no se puede cotizar.");
  const q = quoteFor({ unitCostCents: p.unitCostCents, quantity: r.quantity, freightCents: p.freightCents, commissionCents: p.commissionCents }, delivery.tax, settings.depositPct);
  await tdb.importRequest.updateMany({
    where: { id: r.id },
    data: {
      status: "QUOTED",
      unitCostUsd: money(p.unitCostCents),
      freightUsd: money(p.freightCents),
      commissionUsd: money(p.commissionCents),
      totalUsd: money(q.totalCents),
      depositUsd: money(q.depositCents),
      quoteNote: p.note,
      quotedAt: new Date(),
      quotedByName: actor.name,
      ...(p.batchId ? { batchId: p.batchId } : {}),
    },
  });
  await sendPushToCustomer(tenantId, r.customerId, {
    title: "💬 Tu cotización está lista",
    body: `${r.title ?? `Encargo de ${r.sourceStore}`}: ${formatUsd(q.totalCents)} en total, adelanto de ${formatUsd(q.depositCents)}.`,
    url: "/mi-cuenta#encargos",
  }).catch(() => 0);
  return q;
}

export async function rejectImportRequest(tenantId: string, requestId: string, reason: string) {
  const tdb = tenantDb(tenantId);
  const r = await tdb.importRequest.findFirst({ where: { id: requestId }, select: { customerId: true, title: true } });
  const done = await tdb.importRequest.updateMany({ where: { id: requestId, status: { in: ["PENDING_REVIEW", "QUOTED"] } }, data: { status: "REJECTED", rejectReason: reason } });
  if (!done.count || !r) throw new OrderError("Este encargo ya no se puede rechazar.");
  await sendPushToCustomer(tenantId, r.customerId, { title: "Encargo no aprobado", body: reason, url: "/mi-cuenta#encargos" }).catch(() => 0);
}

/**
 * Publica el encargo en la galería del lote para que otras se sumen. Nunca si
 * la clienta lo marcó privado/discreto. La foto se copia a una imagen pública.
 */
export async function publishImportRequest(
  tenantId: string,
  requestId: string,
  p: { title: string; description: string | null; estimatedPriceCents: number | null; sizes: string | null; colors: string | null },
) {
  const tdb = tenantDb(tenantId);
  const r = await tdb.importRequest.findFirst({ where: { id: requestId }, select: { id: true, isPrivate: true, batchId: true, productId: true, sourceUrl: true, sourceStore: true, photoKey: true } });
  if (!r) throw new OrderError("Encargo no encontrado.");
  if (r.isPrivate) throw new OrderError("La clienta marcó este producto como privado: no se publica.");
  if (r.productId) throw new OrderError("Este encargo ya está publicado.");
  if (!r.batchId) throw new OrderError("Asígnale un lote antes de publicarlo.");
  return tdb.$transaction(async (tx) => {
    const product = await tx.importProduct.create({
      data: { tenantId, batchId: r.batchId!, title: p.title, description: p.description, sourceStore: r.sourceStore, sourceUrl: r.sourceUrl, estimatedPriceUsd: p.estimatedPriceCents === null ? null : money(p.estimatedPriceCents), sizes: p.sizes, colors: p.colors },
      select: { id: true },
    });
    if (r.photoKey) {
      const photo = await tx.tenantAsset.findFirst({ where: { tenantId, kind: r.photoKey }, select: { mimeType: true, data: true, sizeBytes: true } });
      if (photo && photo.mimeType.startsWith("image/")) {
        const key = mediaKey("importacion", product.id);
        await tx.tenantAsset.create({ data: { tenantId, kind: key, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, data: photo.data } });
        await tx.importProduct.update({ where: { id: product.id }, data: { imageUrl: mediaUrl(key) } });
      }
    }
    await tx.importRequest.update({ where: { id: r.id }, data: { productId: product.id } });
    return product;
  });
}

/**
 * Cambia el estado del lote. Al pasar a «En proceso», los encargos con el
 * adelanto pagado avanzan a «Preparando» (comprado / en tránsito).
 */
export async function setBatchStatus(tenantId: string, batchId: string, status: BatchStatus, actor: NonNullable<Actor>) {
  const tdb = tenantDb(tenantId);
  const res = await tdb.importBatch.updateMany({ where: { id: batchId }, data: { status } });
  if (!res.count) throw new OrderError("Lote no encontrado.");
  let advanced = 0;
  if (status === "IN_PROCESS") {
    const orders = await tdb.order.findMany({ where: { isImport: true, status: "PAID", importRequest: { batchId } }, select: { id: true } });
    for (const o of orders) {
      await advanceOrder(tenantId, o.id, "PREPARING", { carrier: null, trackingNumber: null }, actor);
      advanced += 1;
    }
  }
  return { advanced };
}

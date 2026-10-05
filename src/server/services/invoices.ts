import { Prisma } from "@/generated/prisma/client";
import type { IdType, InvoiceType } from "@/generated/prisma/enums";
import { tenantDb, type TenantDb } from "@/server/db";
import { getCurrentRates } from "@/server/queries/store";
import { OrderError, type Actor } from "@/server/services/orders";
import { centsToDecimalString, toCents, vesToUsdCents } from "@/lib/money";
import { rateToBp } from "@/lib/tax-ve";
import {
  creditedQuantities,
  creditNoteFrom,
  debitNoteFrom,
  formatControlNumber,
  formatInvoiceNumber,
  invoiceFromOrder,
  monthRange,
  parseLines,
  salesBookRows,
  type BookDocument,
  type ControlMode,
  type InvoiceAmounts,
} from "@/lib/invoicing";
import { formatVeId } from "@/lib/ve-ids";

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
const money = centsToDecimalString;

/** Documentos que maneja el panel (la nota de entrega queda para más adelante). */
export const DOCUMENT_TYPES: InvoiceType[] = ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"];

/** La razón social del ejemplo no sirve para facturar. */
export const isFiscalReady = (t: { legalName: string | null; rif: string | null; fiscalAddress: string | null }) =>
  Boolean(t.legalName && !t.legalName.includes("por configurar") && t.rif && t.fiscalAddress);

/** Series del negocio (crea las que falten con valores por defecto). */
export async function getSeries(tenantId: string) {
  const tdb = tenantDb(tenantId);
  const existing = await tdb.invoiceSeries.findMany({ where: { type: { in: DOCUMENT_TYPES } }, orderBy: { type: "asc" } });
  const missing = DOCUMENT_TYPES.filter((t) => !existing.some((s) => s.type === t));
  if (missing.length) {
    // La serie de las notas toma el modo de control de la factura (mismo proveedor o mismos formatos).
    const mode = existing.find((s) => s.type === "INVOICE")?.controlMode ?? "NONE";
    await tdb.invoiceSeries.createMany({ data: missing.map((type) => ({ tenantId, type, controlMode: mode })), skipDuplicates: true });
    return tdb.invoiceSeries.findMany({ where: { type: { in: DOCUMENT_TYPES } }, orderBy: { type: "asc" } });
  }
  return existing;
}

/**
 * Reserva el próximo número del documento y, en forma libre, el próximo número
 * de control con UPDATE atómicos: dos documentos al mismo tiempo nunca reciben
 * el mismo número. El número de control es UNO solo y consecutivo para facturas
 * y notas (salen de los mismos formatos): su rango vive en la serie de facturas.
 */
async function takeNumbers(tx: Tx, tenantId: string, type: InvoiceType) {
  const [row] = await tx.$queryRaw<{ id: string; number: number; controlMode: ControlMode }[]>`
    UPDATE invoice_series SET "nextNumber" = "nextNumber" + 1
    WHERE id = (SELECT id FROM invoice_series WHERE "tenantId" = ${tenantId} AND type = ${type}::"InvoiceType" AND "isActive" ORDER BY series LIMIT 1)
    RETURNING id, "nextNumber" - 1 AS number, "controlMode"`;
  if (!row) throw new OrderError("No hay una serie activa para este documento. Revisa Facturación > Configuración.");
  let controlNumber: string | null = null;
  if (row.controlMode === "FREE_FORM") {
    const [c] = await tx.$queryRaw<{ control: number | null; controlPrefix: string | null; controlTo: number | null }[]>`
      UPDATE invoice_series SET "nextControl" = "nextControl" + 1
      WHERE id = (SELECT id FROM invoice_series WHERE "tenantId" = ${tenantId} AND type = 'INVOICE' AND "isActive" ORDER BY series LIMIT 1)
      RETURNING "nextControl" - 1 AS control, "controlPrefix", "controlTo"`;
    if (!c || c.control === null) throw new OrderError("Configura el rango de números de control de tus formatos (Facturación > Configuración).");
    if (c.controlTo !== null && c.control > c.controlTo) {
      throw new OrderError("Se acabaron los números de control de tus formatos. Pide más a la imprenta y carga el nuevo rango.");
    }
    controlNumber = formatControlNumber(c.controlPrefix, c.control);
  }
  return { seriesId: row.id, number: Number(row.number), controlNumber };
}

async function requireFiscalTenant(tenantId: string) {
  const tenant = await tenantDb(tenantId).tenant.findFirst({ where: { id: tenantId }, select: { legalName: true, rif: true, fiscalAddress: true } });
  if (!tenant || !isFiscalReady(tenant)) {
    throw new OrderError("Antes de facturar, carga la razón social, el RIF y el domicilio fiscal en Facturación > Configuración.");
  }
}

function amountsData(a: InvoiceAmounts) {
  return {
    lines: a.lines as unknown as Prisma.InputJsonValue,
    taxableVes: money(a.taxableVes),
    exemptVes: money(a.exemptVes),
    ivaRate: (a.ivaRateBp / 10_000).toFixed(4),
    ivaVes: money(a.ivaVes),
    igtfBaseVes: money(a.igtfBaseVes),
    igtfVes: money(a.igtfVes),
    totalVes: money(a.totalVes),
  };
}

function uniqueControl(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new OrderError("Ese número de control ya está en otro documento.");
  }
  throw error;
}

// ───────────────────────────── Factura ─────────────────────────────

export type Buyer = { name: string; idType: IdType | null; idNumber: string | null; address: string | null; phone: string | null; email: string | null };

/** Montos que tendría la factura de un pedido hoy (para la vista previa y para emitir). */
export async function previewOrderInvoice(tenantId: string, orderId: string) {
  const tdb = tenantDb(tenantId);
  const [order, rates] = await Promise.all([
    tdb.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        status: true,
        paidAt: true,
        customerName: true,
        customerIdType: true,
        customerIdNumber: true,
        customerPhone: true,
        customerEmail: true,
        shippingAddress: true,
        shippingCity: true,
        shippingState: true,
        ivaRate: true,
        shippingUsd: true,
        igtfUsd: true,
        igtfBaseUsd: true,
        totalUsd: true,
        items: { orderBy: { id: "asc" }, select: { productName: true, sizeLabel: true, colorName: true, sku: true, quantity: true, lineBaseUsd: true, ivaRate: true } },
        invoices: { where: { type: "INVOICE", status: "ISSUED" }, select: { id: true } },
      },
    }),
    getCurrentRates(tenantId),
  ]);
  if (!order) return null;
  const bcvRate = rates.bcv?.rate ?? null;
  const amounts = bcvRate
    ? invoiceFromOrder(
        order.items.map((it) => ({
          description: [it.productName, it.sizeLabel && `Talla ${it.sizeLabel}`, it.colorName, it.sku && `(${it.sku})`].filter(Boolean).join(" · "),
          quantity: it.quantity,
          baseUsdCents: toCents(it.lineBaseUsd),
          exempt: Number(it.ivaRate) === 0,
        })),
        {
          shippingUsdCents: toCents(order.shippingUsd),
          ivaRateBp: rateToBp(order.ivaRate),
          igtfUsdCents: toCents(order.igtfUsd),
          igtfBaseUsdCents: toCents(order.igtfBaseUsd),
          bcvRate,
        },
      )
    : null;
  const problem =
    order.status === "CANCELLED"
      ? "El pedido está anulado."
      : !order.paidAt
        ? "El pedido todavía no está pagado completo."
        : order.invoices.length
          ? "Este pedido ya tiene factura."
          : !bcvRate
            ? "Carga la tasa BCV de hoy para facturar."
            : null;
  return { order, bcvRate, amounts, problem };
}

/** Emite la factura de un pedido pagado (en Bs a la tasa BCV de hoy). */
export async function issueInvoice(tenantId: string, orderId: string, buyer: Buyer, actor: NonNullable<Actor>) {
  await requireFiscalTenant(tenantId);
  await getSeries(tenantId);
  const preview = await previewOrderInvoice(tenantId, orderId);
  if (!preview) throw new OrderError("Pedido no encontrado.");
  if (preview.problem || !preview.amounts || !preview.bcvRate) throw new OrderError(preview.problem ?? "No se puede facturar este pedido.");
  const { amounts, bcvRate, order } = preview;
  const tdb = tenantDb(tenantId);
  try {
    return await tdb.$transaction(async (tx) => {
      // Una sola factura vigente por pedido (otra persona pudo emitirla mientras tanto).
      const already = await tx.invoice.count({ where: { orderId, type: "INVOICE", status: "ISSUED" } });
      if (already) throw new OrderError("Este pedido ya tiene factura.");
      const n = await takeNumbers(tx, tenantId, "INVOICE");
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          orderId,
          seriesId: n.seriesId,
          type: "INVOICE",
          number: n.number,
          controlNumber: n.controlNumber,
          buyerName: buyer.name,
          buyerIdType: buyer.idType,
          buyerIdNumber: buyer.idNumber,
          buyerAddress: buyer.address,
          buyerPhone: buyer.phone,
          buyerEmail: buyer.email,
          bcvRate: String(bcvRate),
          totalUsd: money(toCents(order.totalUsd) + toCents(order.igtfUsd)),
          createdByName: actor.name,
          ...amountsData(amounts),
        },
        select: { id: true, number: true },
      });
      await tx.orderEvent.create({ data: { orderId, userId: actor.id, userName: actor.name, note: `Factura N.º ${formatInvoiceNumber("", invoice.number)} emitida` } });
      return invoice;
    });
  } catch (e) {
    return uniqueControl(e);
  }
}

/** Anota el número de control que asignó la imprenta digital. */
export async function setControlNumber(tenantId: string, invoiceId: string, control: string) {
  const tdb = tenantDb(tenantId);
  const inv = await tdb.invoice.findFirst({ where: { id: invoiceId }, select: { controlNumber: true, status: true, series: { select: { controlMode: true } } } });
  if (!inv) throw new OrderError("Documento no encontrado.");
  if (inv.series.controlMode === "FREE_FORM") throw new OrderError("En forma libre el número de control sale de tus formatos.");
  if (inv.status === "VOIDED") throw new OrderError("El documento está anulado.");
  if (inv.controlNumber) throw new OrderError("Este documento ya tiene número de control: no se cambia.");
  try {
    // Solo si sigue sin número (otra persona pudo anotarlo mientras tanto).
    const r = await tdb.invoice.updateMany({ where: { id: invoiceId, controlNumber: null }, data: { controlNumber: control } });
    if (!r.count) throw new OrderError("Este documento ya tiene número de control: no se cambia.");
  } catch (e) {
    uniqueControl(e);
  }
}

async function loadInvoiceForNote(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findFirst({
    where: { id: invoiceId },
    select: {
      id: true,
      orderId: true,
      type: true,
      status: true,
      number: true,
      lines: true,
      ivaRate: true,
      bcvRate: true,
      buyerName: true,
      buyerIdType: true,
      buyerIdNumber: true,
      buyerAddress: true,
      buyerPhone: true,
      buyerEmail: true,
      notes: { where: { type: "CREDIT_NOTE", status: "ISSUED" }, select: { lines: true } },
    },
  });
  if (!inv) throw new OrderError("Factura no encontrada.");
  if (inv.type !== "INVOICE") throw new OrderError("Las notas se hacen sobre una factura.");
  if (inv.status !== "ISSUED") throw new OrderError("La factura está anulada.");
  return inv;
}

/**
 * Nota de crédito por devolución: por cada renglón, cuántas unidades se
 * devuelven. No mueve el stock (si la mercancía vuelve, ajústalo en el producto).
 */
export async function issueCreditNote(tenantId: string, invoiceId: string, quantities: number[], concept: string, actor: NonNullable<Actor>) {
  await requireFiscalTenant(tenantId);
  await getSeries(tenantId);
  const tdb = tenantDb(tenantId);
  try {
    return await tdb.$transaction(async (tx) => {
      const inv = await loadInvoiceForNote(tx, invoiceId);
      const original = parseLines(inv.lines);
      const credited = creditedQuantities(original, inv.notes.map((n) => parseLines(n.lines)));
      const available = original.map((l, i) => Math.max(0, l.quantity - credited[i]));
      if (quantities.some((q, i) => q > (available[i] ?? 0))) throw new OrderError("Estás devolviendo más de lo que queda en la factura.");
      const amounts = creditNoteFrom(original, quantities, rateToBp(inv.ivaRate));
      if (!amounts.lines.length) throw new OrderError("Elige al menos una prenda para la nota de crédito.");
      const n = await takeNumbers(tx, tenantId, "CREDIT_NOTE");
      return tx.invoice.create({
        data: {
          tenantId,
          orderId: inv.orderId,
          seriesId: n.seriesId,
          type: "CREDIT_NOTE",
          number: n.number,
          controlNumber: n.controlNumber,
          relatedInvoiceId: inv.id,
          concept,
          buyerName: inv.buyerName,
          buyerIdType: inv.buyerIdType,
          buyerIdNumber: inv.buyerIdNumber,
          buyerAddress: inv.buyerAddress,
          buyerPhone: inv.buyerPhone,
          buyerEmail: inv.buyerEmail,
          bcvRate: inv.bcvRate,
          totalUsd: money(vesToUsdCents(amounts.totalVes, Number(inv.bcvRate))),
          createdByName: actor.name,
          ...amountsData(amounts),
        },
        select: { id: true },
      });
    });
  } catch (e) {
    return uniqueControl(e);
  }
}

/** Nota de débito: un cargo adicional sobre la factura (concepto y base en Bs). */
export async function issueDebitNote(tenantId: string, invoiceId: string, concept: string, baseVes: number, exempt: boolean, actor: NonNullable<Actor>) {
  await requireFiscalTenant(tenantId);
  await getSeries(tenantId);
  const tdb = tenantDb(tenantId);
  try {
    return await tdb.$transaction(async (tx) => {
      const inv = await loadInvoiceForNote(tx, invoiceId);
      const amounts = debitNoteFrom(concept, baseVes, exempt, rateToBp(inv.ivaRate));
      const n = await takeNumbers(tx, tenantId, "DEBIT_NOTE");
      return tx.invoice.create({
        data: {
          tenantId,
          orderId: inv.orderId,
          seriesId: n.seriesId,
          type: "DEBIT_NOTE",
          number: n.number,
          controlNumber: n.controlNumber,
          relatedInvoiceId: inv.id,
          concept,
          buyerName: inv.buyerName,
          buyerIdType: inv.buyerIdType,
          buyerIdNumber: inv.buyerIdNumber,
          buyerAddress: inv.buyerAddress,
          buyerPhone: inv.buyerPhone,
          buyerEmail: inv.buyerEmail,
          bcvRate: inv.bcvRate,
          totalUsd: money(vesToUsdCents(amounts.totalVes, Number(inv.bcvRate))),
          createdByName: actor.name,
          ...amountsData(amounts),
        },
        select: { id: true },
      });
    });
  } catch (e) {
    return uniqueControl(e);
  }
}

/**
 * Anula un documento (queda en el libro con montos en cero, sin saltar la
 * numeración). Con imprenta digital, una factura con número de control se
 * corrige con nota de crédito, no se anula.
 */
export async function voidDocument(tenantId: string, invoiceId: string, reason: string, actor: NonNullable<Actor>) {
  const tdb = tenantDb(tenantId);
  await tdb.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId },
      select: { status: true, type: true, number: true, orderId: true, controlNumber: true, series: { select: { controlMode: true } }, notes: { where: { status: "ISSUED" }, select: { id: true } } },
    });
    if (!inv) throw new OrderError("Documento no encontrado.");
    if (inv.status === "VOIDED") throw new OrderError("Ya está anulado.");
    if (inv.notes.length) throw new OrderError("Tiene notas de crédito o débito vigentes: anúlalas primero.");
    if (inv.series.controlMode === "DIGITAL_PRINTER" && inv.controlNumber) {
      throw new OrderError("Con imprenta digital, un documento con número de control se corrige con una nota de crédito.");
    }
    await tx.invoice.updateMany({ where: { id: invoiceId, status: "ISSUED" }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
    await tx.orderEvent.create({
      data: { orderId: inv.orderId, userId: actor.id, userName: actor.name, note: `Documento N.º ${formatInvoiceNumber("", inv.number)} anulado: ${reason}` },
    });
  });
}

// ───────────────────────────── Consultas ─────────────────────────────

const docSelect = {
  id: true,
  type: true,
  number: true,
  controlNumber: true,
  status: true,
  issuedAt: true,
  buyerName: true,
  buyerIdType: true,
  buyerIdNumber: true,
  taxableVes: true,
  exemptVes: true,
  ivaRate: true,
  ivaVes: true,
  igtfVes: true,
  totalVes: true,
  totalUsd: true,
  series: { select: { series: true, controlMode: true } },
  related: { select: { number: true, series: { select: { series: true } } } },
  order: { select: { id: true, number: true } },
} satisfies Prisma.InvoiceSelect;

/** Documentos emitidos en un mes (más recientes primero). */
export async function listDocuments(tenantId: string, month: string, q: string) {
  const range = monthRange(month);
  if (!range) return [];
  const n = Number(q.replace(/\D/g, ""));
  return tenantDb(tenantId).invoice.findMany({
    where: {
      type: { in: DOCUMENT_TYPES },
      issuedAt: { gte: range.from, lt: range.to },
      ...(q
        ? {
            OR: [
              { buyerName: { contains: q, mode: "insensitive" } },
              { buyerIdNumber: { contains: q.replace(/\D/g, "") || q } },
              { controlNumber: { contains: q } },
              ...(n ? [{ number: n }, { order: { number: n } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: 300,
    select: docSelect,
  });
}

/** Libro de ventas del mes: documentos en orden de emisión, con signo. */
export async function salesBook(tenantId: string, month: string) {
  const range = monthRange(month);
  if (!range) return [];
  const docs = await tenantDb(tenantId).invoice.findMany({
    where: { type: { in: DOCUMENT_TYPES }, issuedAt: { gte: range.from, lt: range.to } },
    orderBy: [{ issuedAt: "asc" }, { number: "asc" }],
    select: docSelect,
  });
  return salesBookRows(
    docs.map(
      (d): BookDocument => ({
        issuedAt: d.issuedAt,
        type: d.type,
        number: formatInvoiceNumber(d.series.series, d.number),
        controlNumber: d.controlNumber,
        buyerName: d.buyerName,
        buyerId: d.buyerIdNumber ? formatVeId(d.buyerIdType, d.buyerIdNumber) : null,
        affects: d.related ? formatInvoiceNumber(d.related.series.series, d.related.number) : null,
        voided: d.status === "VOIDED",
        taxableVes: toCents(d.taxableVes),
        exemptVes: toCents(d.exemptVes),
        ivaRateBp: rateToBp(d.ivaRate),
        ivaVes: toCents(d.ivaVes),
        igtfVes: toCents(d.igtfVes),
        totalVes: toCents(d.totalVes),
      }),
    ),
  );
}

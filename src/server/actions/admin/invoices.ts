"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { CASHIER_ROLES, isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { OrderError, type Actor } from "@/server/services/orders";
import { issueCreditNote, issueDebitNote, issueInvoice, setControlNumber, voidDocument } from "@/server/services/invoices";
import { parseAmount } from "@/lib/money";
import { formatControlNumber } from "@/lib/invoicing";
import { normalizeVePhone, parseVeId } from "@/lib/ve-ids";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

async function staff(owner = false) {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, CASHIER_ROLES, "/admin/facturacion");
  if (owner && !isTenantAdmin(ctx)) return null;
  const actor: NonNullable<Actor> = { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email };
  return { tenant, actor };
}

async function run(fn: () => Promise<Result>): Promise<Result> {
  try {
    const r = await fn();
    revalidatePath("/t/[domain]/admin", "layout");
    return r;
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    throw e;
  }
}

const id = z.string().min(5).max(40);

const buyerInput = z.object({
  name: z.string().trim().min(3, "Escribe el nombre o la razón social").max(120),
  idDoc: z.string().trim().max(20),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(20),
  email: z.union([z.literal(""), z.string().trim().email("Correo inválido").max(120)]),
});

/** Emite la factura de un pedido pagado. */
export async function issueInvoiceAction(orderId: string, raw: unknown): Promise<Result> {
  const s = await staff();
  if (!s) return { ok: false, error: "Sin permiso" };
  const parsed = buyerInput.safeParse(raw);
  if (!parsed.success || !id.safeParse(orderId).success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  const doc = parseVeId(d.idDoc);
  if (!doc) return { ok: false, error: "La factura necesita la cédula o el RIF del comprador (ej. V-12345678 o J-40123456-7)" };
  const phone = d.phone ? normalizeVePhone(d.phone) : null;
  if (d.phone && !phone) return { ok: false, error: "Teléfono inválido (ej. 0414-1234567)" };
  if (doc.isRif && !d.address) return { ok: false, error: "Con RIF, escribe el domicilio fiscal del comprador" };
  return run(async () => {
    const inv = await issueInvoice(s.tenant.id, orderId, { name: d.name, idType: doc.type, idNumber: doc.number, address: d.address || null, phone, email: d.email || null }, s.actor);
    return { ok: true, id: inv.id };
  });
}

/** Número de control que asignó la imprenta digital. */
export async function setControlNumberAction(invoiceId: string, control: string): Promise<Result> {
  const s = await staff();
  if (!s) return { ok: false, error: "Sin permiso" };
  const value = control.trim().toUpperCase();
  if (!id.safeParse(invoiceId).success || !/^[0-9A-Z][0-9A-Z-]{2,24}$/.test(value)) return { ok: false, error: "Escribe el número de control tal como lo dio la imprenta (ej. 00-00001234)" };
  return run(async () => {
    await setControlNumber(s.tenant.id, invoiceId, value);
    return { ok: true, message: "Número de control guardado." };
  });
}

export async function creditNoteAction(invoiceId: string, quantities: number[], concept: string): Promise<Result> {
  const s = await staff();
  if (!s) return { ok: false, error: "Sin permiso" };
  const why = concept.trim().slice(0, 200);
  if (!id.safeParse(invoiceId).success || !z.array(z.number().int().min(0).max(10_000)).max(200).safeParse(quantities).success) return { ok: false, error: "Datos inválidos" };
  if (why.length < 3) return { ok: false, error: "Escribe el motivo (devolución, cambio, descuento…)" };
  return run(async () => {
    const nc = await issueCreditNote(s.tenant.id, invoiceId, quantities, why, s.actor);
    return { ok: true, id: nc.id };
  });
}

export async function debitNoteAction(invoiceId: string, raw: { concept: string; amount: string; exempt: boolean }): Promise<Result> {
  const s = await staff();
  if (!s) return { ok: false, error: "Sin permiso" };
  const concept = String(raw.concept ?? "").trim().slice(0, 200);
  const amount = parseAmount(String(raw.amount ?? ""));
  if (!id.safeParse(invoiceId).success) return { ok: false, error: "Factura inválida" };
  if (concept.length < 3) return { ok: false, error: "Escribe el concepto del cargo" };
  if (!amount) return { ok: false, error: "Escribe el monto en Bs (sin IVA)" };
  return run(async () => {
    const nd = await issueDebitNote(s.tenant.id, invoiceId, concept, Math.round(amount * 100), Boolean(raw.exempt), s.actor);
    return { ok: true, id: nd.id };
  });
}

/** Anular un documento: solo la dueña. */
export async function voidDocumentAction(invoiceId: string, reason: string): Promise<Result> {
  const s = await staff(true);
  if (!s) return { ok: false, error: "Solo la administradora anula documentos" };
  const why = reason.trim().slice(0, 200);
  if (!id.safeParse(invoiceId).success) return { ok: false, error: "Documento inválido" };
  if (why.length < 3) return { ok: false, error: "Escribe el motivo de la anulación" };
  return run(async () => {
    await voidDocument(s.tenant.id, invoiceId, why, s.actor);
    return { ok: true, message: "Documento anulado." };
  });
}

// ───────────────────────────── Configuración ─────────────────────────────

const pct = z.string().max(10);

const fiscalInput = z.object({
  legalName: z.string().trim().min(3, "Escribe la razón social").max(160),
  rif: z.string().trim().max(20),
  fiscalAddress: z.string().trim().min(10, "Escribe el domicilio fiscal completo").max(300),
  ivaEnabled: z.boolean(),
  ivaRate: pct,
  taxMode: z.enum(["PRICE_INCLUDES_TAX", "TAX_ADDED"]),
  isSpecialTaxpayer: z.boolean(),
  igtfEnabled: z.boolean(),
  igtfRate: pct,
});

/** Porcentaje escrito ("16", "16,5", "3") → fracción con 4 decimales ("0.1600"); null si es inválido. */
function percent(s: string, max: number): string | null {
  const n = parseAmount(s);
  if (n === null || n > max) return null;
  return (Math.round(n * 100) / 10_000).toFixed(4);
}

/** Datos fiscales del negocio e impuestos (IVA, IGTF). Solo la dueña. */
export async function saveFiscalSettings(raw: unknown): Promise<Result> {
  const s = await staff(true);
  if (!s) return { ok: false, error: "Solo la administradora cambia los datos fiscales" };
  const parsed = fiscalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  const rif = parseVeId(d.rif);
  if (!rif?.isRif) return { ok: false, error: "RIF inválido: letra, 8 números y el dígito verificador (ej. J-40123456-7)" };
  const ivaRate = percent(d.ivaRate, 30);
  const igtfRate = percent(d.igtfRate, 10);
  if (!ivaRate) return { ok: false, error: "Alícuota de IVA inválida (ej. 16)" };
  if (!igtfRate) return { ok: false, error: "Alícuota de IGTF inválida (ej. 3)" };
  const tdb = tenantDb(s.tenant.id);
  await tdb.$transaction([
    tdb.tenant.updateMany({ where: { id: s.tenant.id }, data: { legalName: d.legalName, rif: rif.display, fiscalAddress: d.fiscalAddress } }),
    tdb.tenantSettings.updateMany({
      data: { ivaEnabled: d.ivaEnabled, ivaRate, taxMode: d.taxMode, isSpecialTaxpayer: d.isSpecialTaxpayer, igtfEnabled: d.igtfEnabled, igtfRate },
    }),
  ]);
  revalidatePath("/t/[domain]", "layout");
  return { ok: true, message: "Datos fiscales guardados." };
}

const seriesInput = z.object({
  id: id,
  series: z.string().trim().toUpperCase().max(3).regex(/^[A-Z]*$/, "La serie es una letra (A, B…) o vacía"),
  nextNumber: z.number().int().min(1).max(99_999_999),
  controlMode: z.enum(["DIGITAL_PRINTER", "FREE_FORM", "NONE"]),
  controlPrefix: z.string().trim().max(6),
  nextControl: z.number().int().min(1).max(99_999_999).nullable(),
  controlTo: z.number().int().min(1).max(99_999_999).nullable(),
});

/** Numeración y número de control de una serie. No deja reusar números ya emitidos. */
export async function saveSeries(raw: unknown): Promise<Result> {
  const s = await staff(true);
  if (!s) return { ok: false, error: "Solo la administradora cambia la numeración" };
  const parsed = seriesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  const tdb = tenantDb(s.tenant.id);
  const current = await tdb.invoiceSeries.findFirst({ where: { id: d.id }, select: { id: true, type: true, series: true } });
  if (!current) return { ok: false, error: "Serie no encontrada" };
  const last = await tdb.invoice.aggregate({ where: { seriesId: d.id }, _max: { number: true } });
  if (last._max.number && d.nextNumber <= last._max.number) return { ok: false, error: `Ya se emitió hasta el N.º ${last._max.number}: el siguiente debe ser mayor` };
  if (last._max.number && d.series !== current.series) return { ok: false, error: "Esta serie ya tiene documentos: su letra no se puede cambiar" };

  // El número de control (modo y rango) se configura en la serie de facturas y lo comparten las notas.
  const isInvoice = current.type === "INVOICE";
  if (isInvoice && d.controlMode === "FREE_FORM") {
    if (!d.nextControl || !d.controlTo) return { ok: false, error: "Escribe el rango de números de control de tus formatos (desde y hasta)" };
    if (d.controlTo < d.nextControl) return { ok: false, error: "El número final del rango debe ser mayor que el siguiente a usar" };
    if (d.controlPrefix && !/^[0-9A-Z]{1,4}-?$/i.test(d.controlPrefix)) return { ok: false, error: "El prefijo del número de control es corto (ej. 00-)" };
    const taken = await tdb.invoice.findFirst({ where: { controlNumber: formatControlNumber(d.controlPrefix || "00-", d.nextControl) }, select: { id: true } });
    if (taken) return { ok: false, error: "Ese número de control ya se usó: el siguiente debe ser uno libre" };
  }
  const free = isInvoice && d.controlMode === "FREE_FORM";
  try {
    await tdb.$transaction([
      tdb.invoiceSeries.updateMany({
        where: { id: d.id },
        data: {
          series: d.series,
          nextNumber: d.nextNumber,
          ...(isInvoice
            ? {
                controlMode: d.controlMode,
                controlPrefix: free ? d.controlPrefix || "00-" : null,
                nextControl: free ? d.nextControl : null,
                controlTo: free ? d.controlTo : null,
              }
            : {}),
        },
      }),
      // Las notas siguen el modo de control de las facturas.
      ...(isInvoice ? [tdb.invoiceSeries.updateMany({ where: { type: { not: "INVOICE" } }, data: { controlMode: d.controlMode } })] : []),
    ]);
  } catch {
    return { ok: false, error: "Ya hay otra serie con esa letra para este documento" };
  }
  revalidatePath("/t/[domain]/admin/facturacion", "layout");
  return { ok: true, message: "Numeración guardada." };
}

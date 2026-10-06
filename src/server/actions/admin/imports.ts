"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { OrderError } from "@/server/services/orders";
import { publishImportRequest, quoteImportRequest, rejectImportRequest, setBatchStatus } from "@/server/services/imports";
import { parseAmount } from "@/lib/money";
import { uniqueSlug } from "@/lib/slug";
import { caracasDay } from "@/lib/blog";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Gerencia y administradora gestionan las importaciones; la configuración, solo la dueña. */
async function manager(owner = false) {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], "/admin/importaciones");
  if (owner && !isTenantAdmin(ctx)) return null;
  return { tenant, tdb: tenantDb(tenant.id), actor: { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email } };
}

const done = (message?: string): Result => {
  revalidatePath("/t/[domain]", "layout");
  return { ok: true, message };
};

async function guarded(fn: (m: NonNullable<Awaited<ReturnType<typeof manager>>>) => Promise<Result>, owner = false): Promise<Result> {
  const m = await manager(owner);
  if (!m) return { ok: false, error: "Sin permiso" };
  try {
    return await fn(m);
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    throw e;
  }
}

const id = z.string().min(5).max(40);
/** Monto en USD escrito por el personal (acepta 12,50 o 12.50) → centavos. */
const cents = (v: string) => {
  const n = parseAmount(v);
  return n === null || n > 100_000 ? null : Math.round(n * 100);
};
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

// ───────────────────────────── Encargos ─────────────────────────────

const quoteInput = z.object({ unitCost: z.string(), freight: z.string(), commission: z.string(), note: optText(300), batchId: optText(40) });

export async function quoteRequest(requestId: string, raw: unknown): Promise<Result> {
  return guarded(async (m) => {
    const parsed = quoteInput.safeParse(raw);
    if (!id.safeParse(requestId).success || !parsed.success) return { ok: false, error: "Revisa los datos" };
    const d = parsed.data;
    const [unitCostCents, freightCents, commissionCents] = [d.unitCost, d.freight, d.commission].map(cents);
    if (unitCostCents === null || !unitCostCents) return { ok: false, error: "Escribe el costo del producto" };
    if (freightCents === null || commissionCents === null) return { ok: false, error: "Revisa el flete y la comisión" };
    if (d.batchId && !(await m.tdb.importBatch.findFirst({ where: { id: d.batchId }, select: { id: true } }))) return { ok: false, error: "Ese lote no existe" };
    const q = await quoteImportRequest(m.tenant.id, requestId, { unitCostCents, freightCents, commissionCents, note: d.note, batchId: d.batchId }, m.actor);
    return done(`Cotización enviada: total $${(q.totalCents / 100).toFixed(2)}, adelanto $${(q.depositCents / 100).toFixed(2)}.`);
  });
}

export async function rejectRequest(requestId: string, reason: string): Promise<Result> {
  return guarded(async (m) => {
    const why = String(reason ?? "").trim().slice(0, 300);
    if (!id.safeParse(requestId).success) return { ok: false, error: "Encargo inválido" };
    if (why.length < 3) return { ok: false, error: "Escribe el motivo (lo ve la clienta)" };
    await rejectImportRequest(m.tenant.id, requestId, why);
    return done("Encargo rechazado.");
  });
}

export async function saveRequestNote(requestId: string, note: string): Promise<Result> {
  return guarded(async (m) => {
    if (!id.safeParse(requestId).success) return { ok: false, error: "Encargo inválido" };
    await m.tdb.importRequest.updateMany({ where: { id: requestId }, data: { adminNote: String(note ?? "").trim().slice(0, 500) || null } });
    return done("Nota guardada.");
  });
}

const publishInput = z.object({
  title: z.string().trim().min(3, "Escribe el nombre del producto").max(120),
  description: optText(400),
  estimatedPrice: z.string().max(20),
  sizes: optText(200),
  colors: optText(200),
});

/** Publica el encargo en la galería del lote (nunca si es privado). */
export async function publishRequest(requestId: string, raw: unknown): Promise<Result> {
  return guarded(async (m) => {
    const parsed = publishInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
    const d = parsed.data;
    const price = d.estimatedPrice.trim() ? cents(d.estimatedPrice) : null;
    if (d.estimatedPrice.trim() && price === null) return { ok: false, error: "Revisa el precio estimado" };
    await publishImportRequest(m.tenant.id, requestId, { title: d.title, description: d.description, estimatedPriceCents: price, sizes: d.sizes, colors: d.colors });
    return done("Publicado en la galería del lote.");
  });
}

// ───────────────────────────── Galería ─────────────────────────────

export async function setProductPublished(productId: string, published: boolean): Promise<Result> {
  return guarded(async (m) => {
    if (!id.safeParse(productId).success) return { ok: false, error: "Producto inválido" };
    await m.tdb.importProduct.updateMany({ where: { id: productId }, data: { isPublished: Boolean(published) } });
    return done(published ? "Visible en la galería." : "Oculto de la galería.");
  });
}

// ───────────────────────────── Lotes ─────────────────────────────

const batchInput = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del lote").max(80),
  description: optText(400),
  opensAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha de apertura"),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha de cierre"),
  estimatedArrival: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

/** Crea o edita un lote. Las fechas son días de Caracas (abre al inicio, cierra al final del día). */
export async function saveBatch(batchId: string | null, raw: unknown): Promise<Result> {
  return guarded(async (m) => {
    const parsed = batchInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
    const d = parsed.data;
    const opensAt = caracasDay(d.opensAt);
    const closesAt = caracasDay(d.closesAt, true);
    const estimatedArrival = d.estimatedArrival ? caracasDay(d.estimatedArrival) : null;
    if (!opensAt || !closesAt) return { ok: false, error: "Revisa las fechas" };
    if (closesAt.getTime() <= opensAt.getTime()) return { ok: false, error: "El cierre debe ser después de la apertura" };
    const data = { name: d.name, description: d.description, opensAt, closesAt, estimatedArrival };
    if (batchId) {
      if (!id.safeParse(batchId).success) return { ok: false, error: "Lote inválido" };
      await m.tdb.importBatch.updateMany({ where: { id: batchId }, data });
      return done("Lote guardado.");
    }
    const slug = await uniqueSlug(d.name, async (s) => Boolean(await m.tdb.importBatch.findFirst({ where: { slug: s }, select: { id: true } })));
    await m.tdb.importBatch.create({ data: { ...data, tenantId: m.tenant.id, slug } });
    return done("Lote creado como borrador. Ábrelo cuando quieras recibir pedidos.");
  });
}

const STATUSES = ["DRAFT", "OPEN", "IN_PROCESS", "DELIVERED", "CANCELLED"] as const;

export async function changeBatchStatus(batchId: string, status: string): Promise<Result> {
  return guarded(async (m) => {
    const s = z.enum(STATUSES).safeParse(status);
    if (!id.safeParse(batchId).success || !s.success) return { ok: false, error: "Estado inválido" };
    const r = await setBatchStatus(m.tenant.id, batchId, s.data, m.actor);
    return done(r.advanced ? `Estado cambiado. ${r.advanced} encargo(s) pasaron a «Preparando» (comprado / en tránsito).` : "Estado cambiado.");
  });
}

// ───────────────────────────── Reseñas ─────────────────────────────

export async function moderateReview(reviewId: string, approve: boolean): Promise<Result> {
  return guarded(async (m) => {
    if (!id.safeParse(reviewId).success) return { ok: false, error: "Reseña inválida" };
    if (approve) await m.tdb.importReview.updateMany({ where: { id: reviewId }, data: { isApproved: true } });
    else await m.tdb.importReview.deleteMany({ where: { id: reviewId } });
    return done(approve ? "Reseña publicada." : "Reseña eliminada.");
  });
}

// ───────────────────────────── Configuración ─────────────────────────────

const settingsInput = z.object({
  depositPct: z.coerce.number().int().min(10, "El adelanto mínimo es 10 %").max(100),
  commissionPct: z.coerce.number().int().min(0).max(100),
});

export async function saveImportSettings(raw: unknown): Promise<Result> {
  return guarded(async (m) => {
    const parsed = settingsInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
    await m.tdb.tenantSettings.updateMany({ data: { importDepositPct: parsed.data.depositPct, importCommissionPct: parsed.data.commissionPct } });
    return done("Configuración guardada. Aplica a las próximas cotizaciones.");
  }, true);
}

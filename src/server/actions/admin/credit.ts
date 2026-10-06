"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { sendPushToCustomer } from "@/server/services/push";
import { parseAmount } from "@/lib/money";
import { CREDIT_LEVELS, asLevel } from "@/lib/credit";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Gerencia (encargada) y administradora gestionan el crédito; la configuración, solo la dueña. */
const CREDIT_ROLES = ["TENANT_ADMIN", "BRANCH_ADMIN"] as const;

async function manager(owner = false) {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, [...CREDIT_ROLES], "/admin/credito");
  if (owner && !isTenantAdmin(ctx)) return null;
  return { tenant, ctx, tdb: tenantDb(tenant.id), name: ctx.user.name ?? ctx.user.email };
}

const done = (message?: string): Result => {
  revalidatePath("/t/[domain]/admin", "layout");
  return { ok: true, message };
};

const id = z.string().min(5).max(40);

/** Aprobar o rechazar una solicitud (con el fiador ya aceptado para aprobar). */
export async function reviewApplication(applicationId: string, raw: { approve: boolean; phoneVerified: boolean; note: string }): Promise<Result> {
  const m = await manager();
  if (!m) return { ok: false, error: "Sin permiso" };
  if (!id.safeParse(applicationId).success) return { ok: false, error: "Solicitud inválida" };
  const note = String(raw.note ?? "").trim().slice(0, 300);
  const app = await m.tdb.creditApplication.findFirst({ where: { id: applicationId }, select: { id: true, status: true, customerId: true, guarantorAcceptedAt: true } });
  if (!app) return { ok: false, error: "La solicitud ya no existe" };
  if (app.status === "APPROVED" || app.status === "REJECTED") return { ok: false, error: "Esta solicitud ya fue revisada" };
  if (raw.approve) {
    if (!app.guarantorAcceptedAt) return { ok: false, error: "El fiador todavía no ha aceptado desde su enlace" };
    if (!raw.phoneVerified) return { ok: false, error: "Confirma primero el teléfono de la clienta (escríbele por WhatsApp)" };
  } else if (note.length < 3) {
    return { ok: false, error: "Escribe el motivo del rechazo (lo ve la clienta)" };
  }
  const now = new Date();
  await m.tdb.$transaction([
    m.tdb.creditApplication.updateMany({
      where: { id: app.id, status: { in: ["WAITING_GUARANTOR", "IN_REVIEW"] } },
      data: { status: raw.approve ? "APPROVED" : "REJECTED", reviewedAt: now, reviewedByName: m.name, reviewNote: note || null },
    }),
    m.tdb.customer.updateMany({
      where: { id: app.customerId },
      data: { creditStatus: raw.approve ? "APPROVED" : "REJECTED", ...(raw.approve ? { phoneVerifiedAt: now } : {}) },
    }),
  ]);
  if (raw.approve) {
    await sendPushToCustomer(m.tenant.id, app.customerId, { title: "🎉 ¡Tu crédito fue aprobado!", body: "Ya puedes comprar con Credi-SF. Elige «Pagar a crédito» al finalizar tu compra.", url: "/mi-cuenta" }).catch(() => 0);
  }
  return done(raw.approve ? "Crédito aprobado." : "Solicitud rechazada.");
}

/** Nivel de crédito a mano (o volver al automático), suspender o reactivar. */
export async function setCustomerCredit(customerId: string, raw: { level: string; status: string; note: string }): Promise<Result> {
  const m = await manager();
  if (!m) return { ok: false, error: "Sin permiso" };
  if (!id.safeParse(customerId).success) return { ok: false, error: "Clienta inválida" };
  const customer = await m.tdb.customer.findFirst({ where: { id: customerId }, select: { creditStatus: true, creditLevel: true } });
  if (!customer) return { ok: false, error: "La clienta ya no existe" };
  const manual = raw.level !== "auto";
  const level = manual ? asLevel(Number(raw.level)) : asLevel(customer.creditLevel);
  if (manual && ![1, 2, 3].includes(Number(raw.level))) return { ok: false, error: "Nivel inválido" };
  const status = raw.status === "SUSPENDED" ? "SUSPENDED" : raw.status === "APPROVED" ? "APPROVED" : customer.creditStatus;
  if (status === "APPROVED" && customer.creditStatus !== "APPROVED" && customer.creditStatus !== "SUSPENDED") {
    return { ok: false, error: "Para aprobar el crédito revisa su solicitud" };
  }
  const note = String(raw.note ?? "").trim().slice(0, 200);
  await m.tdb.customer.updateMany({
    where: { id: customerId },
    data: { creditLevel: level, creditLevelManual: manual, creditLevelNote: manual ? note || `Fijado por ${m.name}` : null, creditStatus: status },
  });
  if (level > customer.creditLevel && status === "APPROVED") {
    await sendPushToCustomer(m.tenant.id, customerId, { title: "⭐ ¡Subiste de nivel!", body: `Ahora eres ${CREDIT_LEVELS[level].name}: ${CREDIT_LEVELS[level].description}.`, url: "/mi-cuenta" }).catch(() => 0);
  }
  return done("Crédito de la clienta actualizado.");
}

const settingsInput = z.object({
  enabled: z.boolean(),
  lateFee: z.string().max(10),
  graceDays: z.number().int().min(0).max(30),
  max1: z.string().max(12),
  max2: z.string().max(12),
  max3: z.string().max(12),
  upgradeAfter: z.number().int().min(1).max(50),
  vipAfter: z.number().int().min(1).max(100),
  oneOpen: z.boolean(),
});

/** Configuración de Credi-SF (recargo por mora, días de gracia, límites y ascensos). Solo la dueña. */
export async function saveCreditSettings(raw: unknown): Promise<Result> {
  const m = await manager(true);
  if (!m) return { ok: false, error: "Solo la administradora cambia la configuración del crédito" };
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  const amounts = [d.lateFee, d.max1, d.max2, d.max3].map((v) => parseAmount(v));
  if (amounts.some((a) => a === null || a > 100_000)) return { ok: false, error: "Revisa los montos" };
  const [lateFee, max1, max2, max3] = amounts as number[];
  if (!(max1 <= max2 && max2 <= max3)) return { ok: false, error: "El límite debe crecer con el nivel (Nivel 1 ≤ Nivel 2 ≤ Nivel 3)" };
  if (d.vipAfter <= d.upgradeAfter) return { ok: false, error: "Para Nivel 3 hacen falta más créditos que para Nivel 2" };
  await m.tdb.tenantSettings.updateMany({
    data: {
      creditEnabled: d.enabled,
      creditLateFeeUsd: lateFee.toFixed(2),
      creditGraceDays: d.graceDays,
      creditMaxLevel1Usd: max1.toFixed(2),
      creditMaxLevel2Usd: max2.toFixed(2),
      creditMaxLevel3Usd: max3.toFixed(2),
      creditUpgradeAfter: d.upgradeAfter,
      creditVipAfter: d.vipAfter,
      creditOneOpen: d.oneOpen,
    },
  });
  revalidatePath("/t/[domain]", "layout");
  return { ok: true, message: "Configuración guardada. Los contratos nuevos usan estos valores; los ya firmados conservan los suyos." };
}

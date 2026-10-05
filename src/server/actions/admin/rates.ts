"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/db";
import { getTenantFromRequest } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { parseRate, percent, rateChange, SUSPICIOUS_CHANGE } from "@/lib/rates";

type Result = { ok: true } | { ok: false; error: string; needsConfirm?: boolean };

const input = z.object({
  source: z.enum(["BCV", "P2P"]),
  rate: z.string().max(30),
  /** "AAAA-MM-DD": desde qué día rige (vacío = ahora) */
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  note: z.string().trim().max(120).optional(),
  /** La dueña confirmó un salto grande */
  confirmed: z.boolean().optional(),
});

/** Registra una tasa nueva (queda en el histórico; nunca se sobrescribe). Dueña o encargada. */
export async function saveRate(raw: unknown): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], "/admin/tasas");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { source, effectiveDate, note, confirmed } = parsed.data;
  const rate = parseRate(parsed.data.rate);
  if (!rate) return { ok: false, error: "Escribe la tasa en bolívares por dólar, por ejemplo 182,25" };

  // Fecha en hora de Caracas (UTC−4). Si es hoy, rige desde ya.
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(now);
  const effectiveAt = !effectiveDate || effectiveDate === today ? now : new Date(`${effectiveDate}T00:00:00-04:00`);

  const tdb = tenantDb(tenant.id);
  const previous = await tdb.exchangeRate.findFirst({ where: { source }, orderBy: { effectiveAt: "desc" }, select: { rate: true } });
  const change = previous ? rateChange(Number(previous.rate), rate) : 0;
  if (Math.abs(change) > SUSPICIOUS_CHANGE && !confirmed) {
    return { ok: false, needsConfirm: true, error: `La tasa cambia ${percent(change)} respecto a la anterior. ¿Está bien escrita?` };
  }

  await tdb.exchangeRate.create({
    data: { tenantId: tenant.id, source, rate: String(rate), effectiveAt, note: note || null, createdById: ctx.user.id },
  });
  revalidatePath("/t/[domain]", "layout");
  return { ok: true };
}

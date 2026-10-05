"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/db";
import { getTenantFromRequest } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { centsToDecimalString, parseAmount } from "@/lib/money";

type Result = { ok: true } | { ok: false; error: string };

/** "" = vacío (null); si no, un monto válido en USD. */
const optionalUsd = z.string().max(20).transform((s, ctx) => {
  if (!s.trim()) return null;
  const n = parseAmount(s);
  if (n === null || n > 10_000) {
    ctx.addIssue({ code: "custom", message: `Monto inválido: ${s}` });
    return null;
  }
  return centsToDecimalString(Math.round(n * 100));
});

const input = z.object({
  pickupEnabled: z.boolean(),
  pickupInfo: z.string().trim().max(240),
  localDeliveryEnabled: z.boolean(),
  localDeliveryUsd: optionalUsd,
  localDeliveryArea: z.string().trim().max(120),
  nationalShippingEnabled: z.boolean(),
  nationalShippingUsd: optionalUsd,
  freeShippingFromUsd: optionalUsd,
  reservationHours: z.number().int().min(1, "Mínimo 1 hora").max(168, "Máximo 7 días"),
});

/** Formas de entrega del checkout y reserva del stock. Solo la dueña. */
export async function saveDeliverySettings(raw: unknown): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireAdmin(tenant, "/admin/entregas");
  if (!isTenantAdmin(ctx)) return { ok: false, error: "Solo la administradora cambia las entregas" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  if (!d.pickupEnabled && !d.localDeliveryEnabled && !d.nationalShippingEnabled) return { ok: false, error: "Deja al menos una forma de entrega activa" };
  await tenantDb(tenant.id).tenantSettings.updateMany({
    data: {
      ...d,
      pickupInfo: d.pickupInfo || null,
      localDeliveryArea: d.localDeliveryArea || null,
    },
  });
  revalidatePath("/t/[domain]", "layout");
  return { ok: true };
}

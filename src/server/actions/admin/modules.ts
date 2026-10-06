"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";

type Result = { ok: true } | { ok: false; error: string };

const input = z.object({ module: z.enum(["imports", "credit"]), enabled: z.boolean() });

/** Prende o apaga un módulo de la tienda. Solo la dueña. */
export async function setModule(raw: unknown): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireAdmin(tenant, "/admin/modulos");
  if (!isTenantAdmin(ctx)) return { ok: false, error: "Solo la administradora prende o apaga módulos" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { module, enabled } = parsed.data;
  await tenantDb(tenant.id).tenantSettings.updateMany({ data: module === "imports" ? { importsEnabled: enabled } : { creditEnabled: enabled } });
  revalidatePath("/t/[domain]", "layout");
  return { ok: true };
}

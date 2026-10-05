"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { getTenantFromRequest } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";

type Result = { ok: true } | { ok: false; error: string };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Usa un color #RRGGBB");
const optionalHex = z.union([z.literal(""), z.null(), hex]);
const themeInput = z.object({ background: hex, surface: hex, text: hex, bar: optionalHex, accent: optionalHex });

/** Paleta de la tienda (fondo, tarjetas, texto, barra y etiquetas). Solo la dueña. */
export async function updateTheme(input: unknown): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireAdmin(tenant, "/admin/apariencia");
  if (!isTenantAdmin(ctx)) return { ok: false, error: "Solo la administradora del negocio cambia los colores" };
  const parsed = themeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Colores inválidos" };
  const t = parsed.data;
  const up = (v: string | null) => (v ? v.toUpperCase() : null);
  await db.tenant.update({
    where: { id: tenant.id },
    data: { themeBackground: up(t.background), themeSurface: up(t.surface), themeText: up(t.text), themeBar: up(t.bar), themeAccent: up(t.accent) },
  });
  revalidatePath("/t/[domain]", "layout");
  return { ok: true };
}

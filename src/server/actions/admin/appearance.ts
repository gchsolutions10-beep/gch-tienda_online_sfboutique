"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { getTenantFromRequest } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { domainPair, parseCustomDomain } from "@/lib/hosts";

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

/**
 * Dominio propio de la tienda (con y sin www). Además hay que agregarlo en
 * Vercel y apuntar el DNS: ver docs/DESPLIEGUE.md. Solo la dueña.
 */
export async function addDomain(input: string): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireAdmin(tenant, "/admin/apariencia");
  if (!isTenantAdmin(ctx)) return { ok: false, error: "Solo la administradora del negocio cambia el dominio" };
  const host = parseCustomDomain(String(input ?? ""), process.env.ROOT_DOMAIN ?? "");
  if (!host) return { ok: false, error: "Escribe un dominio válido, por ejemplo sfboutique.com" };
  const pair = domainPair(host);
  const taken = await db.tenantDomain.findFirst({ where: { domain: { in: pair }, NOT: { tenantId: tenant.id } }, select: { id: true } });
  if (taken) return { ok: false, error: "Ese dominio ya está registrado en otra tienda" };
  await db.tenantDomain.createMany({ data: pair.map((domain) => ({ tenantId: tenant.id, domain })), skipDuplicates: true });
  revalidatePath("/t/[domain]/admin/apariencia");
  return { ok: true };
}

export async function removeDomain(domain: string): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireAdmin(tenant, "/admin/apariencia");
  if (!isTenantAdmin(ctx)) return { ok: false, error: "Solo la administradora del negocio cambia el dominio" };
  const host = parseCustomDomain(String(domain ?? ""));
  if (!host) return { ok: false, error: "Dominio inválido" };
  await db.tenantDomain.deleteMany({ where: { tenantId: tenant.id, domain: { in: domainPair(host) } } });
  revalidatePath("/t/[domain]/admin/apariencia");
  return { ok: true };
}

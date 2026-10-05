import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { parseHost } from "@/lib/hosts";

const tenantSelect = {
  id: true,
  slug: true,
  name: true,
  legalName: true,
  rif: true,
  fiscalAddress: true,
  status: true,
  tagline: true,
  contactEmail: true,
  contactPhone: true,
  instagram: true,
  logoUrl: true,
  primaryColor: true,
  themeBackground: true,
  themeSurface: true,
  themeText: true,
  themeBar: true,
  themeAccent: true,
} as const;

export type CurrentTenant = NonNullable<Awaited<ReturnType<typeof findTenantByHost>>>;

async function findTenantByHost(host: string) {
  const match = parseHost(host, process.env.ROOT_DOMAIN ?? "localhost");

  if (match.kind === "subdomain") {
    return db.tenant.findUnique({ where: { slug: match.slug }, select: tenantSelect });
  }
  if (match.kind === "custom") {
    const domain = await db.tenantDomain.findUnique({
      where: { domain: match.domain },
      select: { tenant: { select: tenantSelect } },
    });
    return domain?.tenant ?? null;
  }
  // Raíz: mientras haya un solo cliente, se sirve el tenant por defecto.
  const fallback = process.env.DEFAULT_TENANT_SLUG;
  return fallback ? db.tenant.findUnique({ where: { slug: fallback }, select: tenantSelect }) : null;
}

/**
 * Resuelve el tenant a partir del segmento `[domain]` que inyecta `src/proxy.ts`.
 * Memoizado por petición. Responde 404 si no existe o está suspendido.
 */
export const getTenant = cache(async (domainParam: string): Promise<CurrentTenant> => {
  const tenant = await findTenantByHost(decodeURIComponent(domainParam));
  if (!tenant || tenant.status === "SUSPENDED") notFound();
  return tenant;
});

/** Para Server Actions (no reciben `params`): resuelve el tenant desde el header Host. */
export async function getTenantFromRequest(): Promise<CurrentTenant> {
  const host = (await headers()).get("host");
  if (!host) notFound();
  return getTenant(host);
}

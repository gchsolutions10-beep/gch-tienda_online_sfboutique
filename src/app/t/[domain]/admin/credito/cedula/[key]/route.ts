import { getTenant } from "@/server/tenant";
import { getCurrentUser } from "@/server/auth/session";
import { resolveAccess } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";

/** Fotos de cédulas del expediente de crédito: PRIVADAS, solo dueña y encargada. */
export async function GET(_request: Request, { params }: RouteContext<"/t/[domain]/admin/credito/cedula/[key]">) {
  const { domain, key } = await params;
  if (!/^credito-[a-z0-9]{10,40}-(compradora|fiador)$/.test(key)) return new Response("No encontrado", { status: 404 });
  const tenant = await getTenant(domain);
  const user = await getCurrentUser();
  if (!user || !resolveAccess(user, tenant.id, ["TENANT_ADMIN", "BRANCH_ADMIN"])) return new Response("No autorizado", { status: 403 });
  const asset = await tenantDb(tenant.id).tenantAsset.findFirst({ where: { kind: key }, select: { mimeType: true, data: true } });
  if (!asset) return new Response("No encontrado", { status: 404 });
  return new Response(asset.data, {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

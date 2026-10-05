import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { CASHIER_ROLES, resolveAccess } from "@/server/auth/guards";

/** Comprobante de pago: privado, solo para el personal que cobra. */
export async function GET(_request: Request, { params }: RouteContext<"/t/[domain]/admin/pedidos/comprobante/[paymentId]">) {
  const { domain, paymentId } = await params;
  const tenant = await getTenant(domain);
  const user = await getCurrentUser();
  if (!user || !resolveAccess(user, tenant.id, CASHIER_ROLES)) return new Response("No autorizado", { status: 403 });

  const tdb = tenantDb(tenant.id);
  const payment = await tdb.payment.findFirst({ where: { id: paymentId }, select: { proofKey: true } });
  if (!payment?.proofKey) return new Response("No encontrado", { status: 404 });
  const asset = await tdb.tenantAsset.findFirst({ where: { kind: payment.proofKey }, select: { mimeType: true, data: true } });
  if (!asset) return new Response("No encontrado", { status: 404 });
  return new Response(asset.data, {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

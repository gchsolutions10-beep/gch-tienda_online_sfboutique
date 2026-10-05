import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { isMediaKey } from "@/lib/media";

/**
 * Imágenes de la marca (logo, banners, productos, categorías). Son públicas (salen en la tienda).
 * La URL lleva ?v=<fecha> y cambia con cada logo nuevo, así que se puede
 * cachear mucho tiempo.
 */
export async function GET(_request: Request, { params }: RouteContext<"/t/[domain]/marca/[kind]">) {
  const { domain, kind } = await params;
  if (!isMediaKey(kind)) return new Response("No encontrado", { status: 404 });
  const tenant = await getTenant(domain);
  const asset = await tenantDb(tenant.id).tenantAsset.findFirst({ where: { kind }, select: { mimeType: true, data: true } });
  if (!asset) return new Response("No encontrado", { status: 404 });
  return new Response(asset.data, {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

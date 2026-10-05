import type { TenantDb } from "@/server/db";
import { sniffImageMime } from "@/lib/files";
import { MEDIA_RULES, mediaKey, mediaUrl, type MediaKind } from "@/lib/media";

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

/**
 * Valida (tipo real por los primeros bytes y peso) y guarda una imagen del
 * negocio. Devuelve la URL pública nueva o un error para mostrar.
 */
export async function saveMedia(
  tx: Tx | TenantDb,
  tenantId: string,
  kind: MediaKind,
  id: string | undefined,
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const rule = MEDIA_RULES[kind];
  if (file.size > rule.maxBytes) return { ok: false, error: `La ${rule.label} pesa demasiado` };
  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageMime(data);
  if (!mimeType) return { ok: false, error: `La ${rule.label} debe ser JPG, PNG o WebP` };
  const key = mediaKey(kind, id);
  await tx.tenantAsset.upsert({
    where: { tenantId_kind: { tenantId, kind: key } },
    update: { mimeType, sizeBytes: data.byteLength, data },
    create: { tenantId, kind: key, mimeType, sizeBytes: data.byteLength, data },
  });
  return { ok: true, url: mediaUrl(key) };
}

export async function deleteMedia(tx: Tx | TenantDb, kind: MediaKind, id: string) {
  await tx.tenantAsset.deleteMany({ where: { kind: mediaKey(kind, id) } });
}

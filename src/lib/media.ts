/**
 * Imágenes que sube el negocio (se guardan en TenantAsset y se sirven en
 * /marca/<kind>). Reglas compartidas por el navegador y el servidor.
 */
export type MediaKind = "logo" | "banner" | "producto" | "categoria" | "portada" | "blog" | "comprobante";

/** Tamaño máximo en el navegador antes de subir (lado más largo) y peso máximo aceptado. */
export const MEDIA_RULES: Record<MediaKind, { maxSide: number; maxBytes: number; label: string }> = {
  logo: { maxSide: 512, maxBytes: 600_000, label: "logo" },
  banner: { maxSide: 1920, maxBytes: 1_200_000, label: "banner" },
  // Fotos de moda verticales (3:4): más resolución para ver la textura de la tela.
  producto: { maxSide: 1400, maxBytes: 900_000, label: "foto del producto" },
  categoria: { maxSide: 900, maxBytes: 600_000, label: "imagen de la categoría" },
  portada: { maxSide: 1400, maxBytes: 900_000, label: "imagen de portada" },
  blog: { maxSide: 1600, maxBytes: 1_000_000, label: "imagen del artículo" },
  comprobante: { maxSide: 1600, maxBytes: 1_500_000, label: "comprobante de pago" },
};

/** Clave del archivo: "logo" o "<tipo>-<id>". */
export function mediaKey(kind: MediaKind, id?: string) {
  return kind === "logo" ? "logo" : `${kind}-${id}`;
}

/** Valida la clave que llega en la URL /marca/<clave>. */
export function isMediaKey(key: string) {
  return key === "logo" || /^(banner|producto|categoria|portada|blog)-[a-z0-9]{10,40}$/.test(key);
}

/** URL pública con versión: cambia con cada imagen nueva, así se puede cachear para siempre. */
export function mediaUrl(key: string) {
  return `/marca/${key}?v=${Date.now()}`;
}

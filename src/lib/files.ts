/** Comprobantes de transferencia aceptados. */
export const PROOF_MAX_BYTES = 1_500_000;

export type ProofMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/**
 * Detecta el tipo REAL por los primeros bytes (no por la extensión ni por lo
 * que declara el navegador). Devuelve null si no es imagen o PDF.
 */
export function sniffProofMime(bytes: Uint8Array): ProofMime | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

/** Logo de la marca: ya reducido en el navegador (máx. 512 px). */
export const LOGO_MAX_BYTES = 600_000;
export type ImageMime = Exclude<ProofMime, "application/pdf">;

/** Igual que sniffProofMime pero solo imágenes (no PDF ni SVG, que puede llevar código). */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  const mime = sniffProofMime(bytes);
  return mime === "application/pdf" ? null : mime;
}

/** Color "#RRGGBB" válido. */
export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

import { LOGO_MAX_BYTES, PROOF_MAX_BYTES } from "@/lib/files";
import { MEDIA_RULES, type MediaKind } from "@/lib/media";

type Prepared = { ok: true; file: File } | { ok: false; error: string };

/** Formatos que aceptamos de entrada (HEIC/HEIF: fotos de iPhone, si el navegador sabe abrirlas). */
const IMAGE_IN = /^image\/(jpeg|png|webp|heic|heif)$/;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];

function draw(bitmap: ImageBitmap, maxSide: number, background: string | null) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  if (background) {
    ctx.fillStyle = background; // JPEG no tiene transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

let webpSupport: Promise<boolean> | null = null;
/** ¿El navegador sabe crear WebP? (Safari antes de la versión 17 no: devuelve PNG.) */
function canMakeWebp() {
  webpSupport ??= (async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    return (await toBlob(c, "image/webp", 0.8))?.type === "image/webp";
  })();
  return webpSupport;
}

/**
 * Reduce la imagen hasta que pese menos de `maxBytes`: baja la calidad y, si
 * no alcanza, achica el tamaño. Usa WebP; si el navegador no sabe crearlo, JPEG
 * (un PNG de una foto pesa 8–15 veces más), o PNG solo si hace falta la
 * transparencia, como en el logo.
 */
async function shrink(bitmap: ImageBitmap, opts: { maxSide: number; maxBytes: number; keepAlpha: boolean; name: string }): Promise<File | null> {
  const type = (await canMakeWebp()) ? "image/webp" : opts.keepAlpha ? "image/png" : "image/jpeg";
  const ext = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  let side = Math.min(opts.maxSide, Math.max(bitmap.width, bitmap.height));
  for (let round = 0; round < 6; round++) {
    const canvas = draw(bitmap, side, type === "image/jpeg" ? "#fff" : null);
    for (const q of type === "image/png" ? [undefined] : QUALITIES) {
      const blob = await toBlob(canvas, type, q);
      if (!blob) return null;
      if (blob.size <= opts.maxBytes) return new File([blob], `${opts.name}.${ext}`, { type: blob.type });
    }
    side = Math.round(side * 0.8);
  }
  return null;
}

/**
 * (Navegador) Reduce una captura de pantalla o foto antes de subirla (máx.
 * 1600 px y 1.5 MB). Los PDF se suben tal cual.
 */
export async function prepareProofFile(file: File): Promise<Prepared> {
  if (file.type === "application/pdf") {
    return file.size <= PROOF_MAX_BYTES ? { ok: true, file } : { ok: false, error: "El PDF pesa más de 1.5 MB" };
  }
  if (!IMAGE_IN.test(file.type)) return { ok: false, error: "Sube una imagen (captura de pantalla o foto) o un PDF" };
  try {
    const bitmap = await createImageBitmap(file);
    const out = await shrink(bitmap, { maxSide: 1600, maxBytes: PROOF_MAX_BYTES, keepAlpha: false, name: "comprobante" });
    bitmap.close();
    if (out) return { ok: true, file: out };
    return { ok: false, error: "No pudimos reducir la imagen. Prueba con una captura de pantalla." };
  } catch {
    // Formato que el navegador no sabe abrir (p. ej. HEIC en algunos equipos).
    return file.size <= PROOF_MAX_BYTES && file.type !== "image/heic" && file.type !== "image/heif"
      ? { ok: true, file }
      : { ok: false, error: "No pudimos abrir la imagen. Envía una captura en JPG o PNG." };
  }
}

/** (Navegador) Prepara el logo: máx. 512 px, conservando la transparencia. */
export async function prepareLogoFile(file: File): Promise<Prepared> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: "Sube el logo en PNG, JPG o WebP" };
  try {
    const bitmap = await createImageBitmap(file);
    const out = await shrink(bitmap, { maxSide: 512, maxBytes: LOGO_MAX_BYTES, keepAlpha: true, name: "logo" });
    bitmap.close();
    return out ? { ok: true, file: out } : { ok: false, error: "El logo pesa demasiado; prueba con uno más sencillo" };
  } catch {
    return { ok: false, error: "No pudimos abrir la imagen. Prueba con un PNG o JPG." };
  }
}

/**
 * (Navegador) Reduce cualquier imagen del negocio según su tipo (ver
 * MEDIA_RULES): WebP, o JPEG si el navegador no sabe hacer WebP.
 */
export async function prepareMediaFile(file: File, kind: MediaKind): Promise<Prepared> {
  const rule = MEDIA_RULES[kind];
  if (!IMAGE_IN.test(file.type)) return { ok: false, error: `Sube la ${rule.label} en JPG, PNG o WebP` };
  try {
    const bitmap = await createImageBitmap(file);
    const out = await shrink(bitmap, { maxSide: rule.maxSide, maxBytes: rule.maxBytes, keepAlpha: kind === "logo", name: kind });
    bitmap.close();
    return out ? { ok: true, file: out } : { ok: false, error: `No pudimos reducir la ${rule.label}. Prueba con otra foto.` };
  } catch {
    return { ok: false, error: "No pudimos abrir la imagen. Prueba con un JPG o PNG." };
  }
}

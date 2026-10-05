import { LOGO_MAX_BYTES, PROOF_MAX_BYTES } from "@/lib/files";
import { MEDIA_RULES, type MediaKind } from "@/lib/media";

/**
 * (Navegador) Reduce una captura de pantalla a JPEG de máx. 1600 px antes de
 * subirla: las capturas de las apps bancarias pesan 1–4 MB y quedan en
 * 150–400 KB sin perder legibilidad. Los PDF se suben tal cual.
 */
export async function prepareProofFile(file: File): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (file.type === "application/pdf") {
    return file.size <= PROOF_MAX_BYTES ? { ok: true, file } : { ok: false, error: "El PDF pesa más de 1.5 MB" };
  }
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) {
    return { ok: false, error: "Sube una imagen (captura de pantalla) o un PDF" };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff"; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("toBlob");
    const compressed = new File([blob], "comprobante.jpg", { type: "image/jpeg" });
    const best = compressed.size < file.size ? compressed : file;
    return best.size <= PROOF_MAX_BYTES ? { ok: true, file: best } : { ok: false, error: "La imagen pesa más de 1.5 MB" };
  } catch {
    // Formato que el navegador no sabe abrir (p. ej. HEIC en algunos equipos).
    return file.size <= PROOF_MAX_BYTES && file.type !== "image/heic" && file.type !== "image/heif"
      ? { ok: true, file }
      : { ok: false, error: "No pudimos procesar la imagen. Envía una captura en JPG o PNG." };
  }
}

/**
 * (Navegador) Prepara el logo: máx. 512 px y en WebP (o PNG si el navegador no
 * sabe hacer WebP), conservando la transparencia.
 */
export async function prepareLogoFile(file: File): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: "Sube el logo en PNG, JPG o WebP" };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/png");
    if (!blob) throw new Error("toBlob");
    const out = new File([blob], `logo.${blob.type === "image/webp" ? "webp" : "png"}`, { type: blob.type });
    return out.size <= LOGO_MAX_BYTES ? { ok: true, file: out } : { ok: false, error: "El logo pesa demasiado; prueba con uno más sencillo" };
  } catch {
    return { ok: false, error: "No pudimos abrir la imagen. Prueba con un PNG o JPG." };
  }
}

/**
 * (Navegador) Reduce cualquier imagen del negocio según su tipo (ver
 * MEDIA_RULES) a WebP, o PNG si el navegador no sabe hacer WebP.
 */
export async function prepareMediaFile(
  file: File,
  kind: MediaKind,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  const rule = MEDIA_RULES[kind];
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: `Sube la ${rule.label} en JPG, PNG o WebP` };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, rule.maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/png");
    if (!blob) throw new Error("toBlob");
    const out = new File([blob], `${kind}.${blob.type === "image/webp" ? "webp" : "png"}`, { type: blob.type });
    return out.size <= rule.maxBytes ? { ok: true, file: out } : { ok: false, error: `La ${rule.label} pesa demasiado` };
  } catch {
    return { ok: false, error: "No pudimos abrir la imagen. Prueba con un JPG o PNG." };
  }
}

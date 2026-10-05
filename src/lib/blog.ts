/**
 * Reglas puras del blog y de la portada (sin BD), para poder probarlas.
 */

export type PostState = "draft" | "scheduled" | "published";

export const POST_STATE: Record<PostState, { label: string; tone: string }> = {
  draft: { label: "Borrador", tone: "bg-cream text-muted" },
  scheduled: { label: "Programado", tone: "bg-amber-100 text-amber-900" },
  published: { label: "Publicado", tone: "bg-emerald-100 text-emerald-900" },
};

/**
 * Estado que ve el personal. Un artículo programado se guarda como PUBLISHED
 * con fecha futura: la tienda solo muestra los que ya llegaron a su fecha, así
 * sale solo el día indicado sin tareas programadas.
 */
export function postState(status: "DRAFT" | "SCHEDULED" | "PUBLISHED", publishedAt: Date | null, now = new Date()): PostState {
  if (status === "DRAFT" || !publishedAt) return "draft";
  return publishedAt.getTime() > now.getTime() ? "scheduled" : "published";
}

/** Minutos de lectura (unas 200 palabras por minuto; mínimo 1). */
export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#*_>[\]()-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Resumen automático: el primer párrafo de texto, sin Markdown, cortado en una palabra. */
export function autoExcerpt(markdown: string, max = 160): string {
  const paragraph =
    markdown
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .find((b) => b && !b.startsWith("#") && !b.startsWith("![")) ?? "";
  const plain = paragraph
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^[-*] /gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2)).trimEnd()}…`;
}

/** Etiquetas escritas con comas → lista limpia, sin repetidas (máx. 8). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(",")) {
    const t = raw.trim().replace(/^#/, "").toLowerCase().slice(0, 30);
    if (t) seen.add(t);
  }
  return [...seen].slice(0, 8);
}

/** Largo recomendado para Google: título ≤ 60 y descripción ≤ 160 caracteres. */
export const SEO_LIMITS = { title: 60, description: 160 } as const;

/**
 * Enlaces permitidos en la portada y los banners: rutas internas de la
 * tienda ("/catalogo?categoria=vestidos") o https.
 */
export function isSafeLink(url: string): boolean {
  if (/^\/(?!\/)[^\s]*$/.test(url)) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** ¿El banner se ve hoy? (activo y dentro de sus fechas) */
export function bannerLive(b: { isActive: boolean; startsAt: Date; endsAt: Date }, now = new Date()): boolean {
  return b.isActive && b.startsAt.getTime() <= now.getTime() && b.endsAt.getTime() >= now.getTime();
}

/** "2026-10-05" en hora de Caracas → inicio (00:00) o fin (23:59:59) de ese día. */
export function caracasDay(date: string, end = false): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 4));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3])) return null;
  return end ? new Date(d.getTime() + 86_400_000 - 1000) : d;
}

/** Fecha y hora "2026-10-05T09:30" (Caracas) → Date. */
export function caracasDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + 4, Number(m[5])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "2026-10-05T09:30" en hora de Caracas (para los campos datetime-local). */
export function toCaracasInput(d: Date): string {
  return new Date(d.getTime() - 4 * 3_600_000).toISOString().slice(0, 16);
}

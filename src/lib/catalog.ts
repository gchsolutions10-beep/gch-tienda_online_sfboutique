import { parseAmount } from "@/lib/money";

/**
 * Reglas puras del catálogo de moda: disponibilidad por variante, etiquetas
 * automáticas y filtros facetados. Sin BD, para poder probarlas.
 */

export type CardVariant = { id: string; sizeId: string | null; colorId: string | null; available: number; priceCents: number };
export type CardSize = { id: string; label: string; kind: string; sortOrder: number };
export type CardColor = { id: string; name: string; hex: string };
export type CardImage = { url: string; alt: string | null; colorId: string | null };

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  category: string;
  priceCents: number;
  compareAtCents: number | null;
  badges: Badge[];
  images: CardImage[];
  colors: CardColor[];
  sizes: CardSize[];
  variants: CardVariant[];
  totalAvailable: number;
};

export type Badge = { kind: "new" | "sale" | "free-shipping" | "custom" | "low" | "sold-out"; label: string };

/** Unidades que se pueden vender (el stock menos lo apartado por pedidos sin pagar). */
export const available = (stock: number, reserved: number) => Math.max(0, stock - reserved);

/** Etiquetas flotantes de la tarjeta, en orden de importancia. */
export function badgesFor(
  p: { publishedAt: Date; compareAtCents: number | null; priceCents: number; freeShipping: boolean; badge: string | null; totalAvailable: number },
  rules: { newProductDays: number; lowStockThreshold: number; freeShippingFromCents: number | null },
  now = new Date(),
): Badge[] {
  if (p.totalAvailable <= 0) return [{ kind: "sold-out", label: "Agotado" }];
  const out: Badge[] = [];
  if (p.badge) out.push({ kind: "custom", label: p.badge });
  if (now.getTime() - p.publishedAt.getTime() <= rules.newProductDays * 86_400_000) out.push({ kind: "new", label: "Nuevo" });
  if (p.compareAtCents && p.compareAtCents > p.priceCents && !p.badge) {
    out.push({ kind: "sale", label: `-${Math.round((1 - p.priceCents / p.compareAtCents) * 100)}%` });
  }
  if (p.freeShipping || (rules.freeShippingFromCents !== null && p.priceCents >= rules.freeShippingFromCents)) {
    out.push({ kind: "free-shipping", label: "Envío gratis" });
  }
  if (p.totalAvailable <= rules.lowStockThreshold) out.push({ kind: "low", label: "¡Últimas unidades!" });
  return out.slice(0, 3);
}

/** Imágenes para mostrar con un color elegido: las de ese color primero (la 2.ª es la del hover). */
export function imagesForColor(images: CardImage[], colorId: string | null): CardImage[] {
  if (!colorId) return images;
  const own = images.filter((i) => i.colorId === colorId);
  return own.length ? [...own, ...images.filter((i) => i.colorId !== colorId)] : images;
}

/** ¿Hay unidades de esta talla en este color? (null = cualquiera) */
export function isAvailable(variants: CardVariant[], sizeId: string | null, colorId: string | null) {
  return variants.some((v) => (sizeId === null || v.sizeId === sizeId) && (colorId === null || v.colorId === colorId) && v.available > 0);
}

export function findVariant(variants: CardVariant[], sizeId: string | null, colorId: string | null) {
  return variants.find((v) => v.sizeId === sizeId && v.colorId === colorId) ?? null;
}

export type CatalogFilters = {
  category: string | null;
  q: string;
  sizes: string[];
  colors: string[];
  minCents: number | null;
  maxCents: number | null;
  onlyAvailable: boolean;
  sort: "relevancia" | "nuevos" | "precio-asc" | "precio-desc";
  page: number;
};

/** Lee los filtros desde la URL (?categoria=&talla=S&talla=M&color=Negro&min=&max=&moneda=bs&disponible=1&orden=&pagina=). */
export function parseFilters(sp: Record<string, string | string[] | undefined>, vesRate: number | null): CatalogFilters {
  const list = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[]) : sp[k] ? [sp[k] as string] : []).filter(Boolean).slice(0, 20);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const inVes = one("moneda") === "bs" && vesRate;
  const money = (k: string) => {
    const n = parseAmount(one(k) ?? "");
    if (n === null) return null;
    return Math.round(inVes ? (n / vesRate!) * 100 : n * 100);
  };
  const sort = one("orden");
  return {
    category: one("categoria"),
    q: (one("q") ?? "").trim().slice(0, 80),
    sizes: list("talla"),
    colors: list("color"),
    minCents: money("min"),
    maxCents: money("max"),
    onlyAvailable: one("disponible") === "1",
    sort: sort === "nuevos" || sort === "precio-asc" || sort === "precio-desc" ? sort : "relevancia",
    page: Math.max(1, Math.min(200, Number(one("pagina")) || 1)),
  };
}

/** ¿El producto cumple los filtros de talla, color y disponibilidad? (en la MISMA variante) */
export function matchesVariantFilters(p: ProductCardData, f: Pick<CatalogFilters, "sizes" | "colors" | "onlyAvailable">) {
  if (!f.sizes.length && !f.colors.length && !f.onlyAvailable) return true;
  const sizeIds = new Set(p.sizes.filter((s) => f.sizes.includes(s.label)).map((s) => s.id));
  const colorIds = new Set(p.colors.filter((c) => f.colors.includes(c.name)).map((c) => c.id));
  return p.variants.some(
    (v) =>
      (!f.sizes.length || (v.sizeId !== null && sizeIds.has(v.sizeId))) &&
      (!f.colors.length || (v.colorId !== null && colorIds.has(v.colorId))) &&
      (!f.onlyAvailable || v.available > 0),
  );
}

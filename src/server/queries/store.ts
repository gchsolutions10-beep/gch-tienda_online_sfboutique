import { cache } from "react";
import { tenantDb } from "@/server/db";
import { toCents } from "@/lib/money";
import {
  available,
  badgesFor,
  matchesVariantFilters,
  type CatalogFilters,
  type ProductCardData,
} from "@/lib/catalog";

/** Tasas vigentes (la más reciente que ya rige de cada fuente). */
export const getCurrentRates = cache(async (tenantId: string) => {
  const tdb = tenantDb(tenantId);
  const now = new Date();
  const [bcv, p2p] = await Promise.all(
    (["BCV", "P2P"] as const).map((source) =>
      tdb.exchangeRate.findFirst({
        where: { source, effectiveAt: { lte: now } },
        orderBy: { effectiveAt: "desc" },
        select: { rate: true, effectiveAt: true },
      }),
    ),
  );
  return {
    bcv: bcv ? { rate: Number(bcv.rate), effectiveAt: bcv.effectiveAt.toISOString() } : null,
    p2p: p2p ? { rate: Number(p2p.rate), effectiveAt: p2p.effectiveAt.toISOString() } : null,
  };
});
export type CurrentRates = Awaited<ReturnType<typeof getCurrentRates>>;

export const getStoreSettings = cache(async (tenantId: string) => {
  const s = await tenantDb(tenantId).tenantSettings.findFirst();
  return {
    showVesPrices: s?.showVesPrices ?? true,
    displayRateSource: s?.displayRateSource ?? "BCV",
    newProductDays: s?.newProductDays ?? 30,
    lowStockThreshold: s?.lowStockThreshold ?? 3,
    freeShippingFromCents: s?.freeShippingFromUsd ? toCents(s.freeShippingFromUsd) : null,
  };
});

/** Tasa con la que se muestran los precios en Bs (null si no hay o el negocio no los muestra). */
export async function getDisplayRate(tenantId: string): Promise<number | null> {
  const [rates, settings] = await Promise.all([getCurrentRates(tenantId), getStoreSettings(tenantId)]);
  if (!settings.showVesPrices) return null;
  return (settings.displayRateSource === "P2P" ? rates.p2p?.rate : rates.bcv?.rate) ?? rates.bcv?.rate ?? null;
}

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  priceUsd: true,
  compareAtUsd: true,
  freeShipping: true,
  badge: true,
  publishedAt: true,
  category: { select: { name: true } },
  images: { orderBy: { sortOrder: "asc" }, select: { url: true, alt: true, colorId: true } },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      stock: true,
      reserved: true,
      priceUsdOverride: true,
      size: { select: { id: true, label: true, kind: true, sortOrder: true } },
      color: { select: { id: true, name: true, hex: true, sortOrder: true } },
    },
  },
} as const;

type CardRow = {
  id: string;
  slug: string;
  name: string;
  priceUsd: { toString(): string };
  compareAtUsd: { toString(): string } | null;
  freeShipping: boolean;
  badge: string | null;
  publishedAt: Date;
  category: { name: string };
  images: { url: string; alt: string | null; colorId: string | null }[];
  variants: {
    id: string;
    stock: number;
    reserved: number;
    priceUsdOverride: { toString(): string } | null;
    size: { id: string; label: string; kind: string; sortOrder: number } | null;
    color: { id: string; name: string; hex: string; sortOrder: number } | null;
  }[];
};

function toCard(p: CardRow, rules: Awaited<ReturnType<typeof getStoreSettings>>): ProductCardData {
  const priceCents = toCents(p.priceUsd);
  const variants = p.variants.map((v) => ({
    id: v.id,
    sizeId: v.size?.id ?? null,
    colorId: v.color?.id ?? null,
    available: available(v.stock, v.reserved),
    priceCents: v.priceUsdOverride ? toCents(v.priceUsdOverride) : priceCents,
  }));
  const uniq = <T extends { id: string }>(xs: (T | null)[]) => [...new Map(xs.filter((x): x is T => x !== null).map((x) => [x.id, x])).values()];
  const sizes = uniq(p.variants.map((v) => v.size)).sort((a, b) => a.sortOrder - b.sortOrder);
  const colors = uniq(p.variants.map((v) => v.color))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name, hex }) => ({ id, name, hex }));
  const totalAvailable = variants.reduce((a, v) => a + v.available, 0);
  const compareAtCents = p.compareAtUsd ? toCents(p.compareAtUsd) : null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category.name,
    priceCents,
    compareAtCents: compareAtCents && compareAtCents > priceCents ? compareAtCents : null,
    badges: badgesFor({ publishedAt: p.publishedAt, compareAtCents, priceCents, freeShipping: p.freeShipping, badge: p.badge, totalAvailable }, rules),
    images: p.images,
    colors,
    sizes,
    variants,
    totalAvailable,
  };
}

const visible = () => ({ isActive: true, publishedAt: { lte: new Date() }, category: { isActive: true } });

/** Portada: tarjetas grandes, categorías, recién llegados, destacados y blog. */
export async function getHome(tenantId: string) {
  const tdb = tenantDb(tenantId);
  const rules = await getStoreSettings(tenantId);
  const now = new Date();
  const [heroCards, banners, categories, newest, featured, posts] = await Promise.all([
    tdb.heroCard.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 4 }),
    tdb.promoBanner.findMany({ where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } }, orderBy: { sortOrder: "asc" }, take: 8 }),
    tdb.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, imageUrl: true, description: true },
    }),
    tdb.product.findMany({ where: visible(), orderBy: { publishedAt: "desc" }, take: 8, select: cardSelect }),
    tdb.product.findMany({ where: { ...visible(), isFeatured: true }, orderBy: { sortOrder: "asc" }, take: 8, select: cardSelect }),
    tdb.blogPost.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: { slug: true, title: true, excerpt: true, coverImageUrl: true, publishedAt: true, category: { select: { name: true } } },
    }),
  ]);
  return {
    heroCards,
    banners,
    categories,
    newest: newest.map((p) => toCard(p, rules)),
    featured: featured.map((p) => toCard(p, rules)),
    posts,
  };
}

const PAGE_SIZE = 24;

/** Catálogo con filtros facetados (categoría, búsqueda, talla, color, precio, disponibilidad). */
export async function getCatalog(tenantId: string, f: CatalogFilters) {
  const tdb = tenantDb(tenantId);
  const rules = await getStoreSettings(tenantId);
  const categories = await tdb.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  const category = categories.find((c) => c.slug === f.category) ?? null;

  const rows = await tdb.product.findMany({
    where: {
      ...visible(),
      ...(category ? { categoryId: category.id } : {}),
      ...(f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: "insensitive" as const } },
              { description: { contains: f.q, mode: "insensitive" as const } },
              { tags: { has: f.q.toLowerCase() } },
              { category: { name: { contains: f.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy:
      f.sort === "nuevos"
        ? { publishedAt: "desc" }
        : f.sort === "precio-asc"
          ? { priceUsd: "asc" }
          : f.sort === "precio-desc"
            ? { priceUsd: "desc" }
            : [{ isFeatured: "desc" }, { sortOrder: "asc" }],
    take: 500,
    select: cardSelect,
  });
  const all = rows.map((p) => toCard(p, rules));

  // Facetas: lo que hay en la categoría/búsqueda actual (antes de talla, color y precio).
  const sizeFacet = new Map<string, { label: string; kind: string; sortOrder: number }>();
  const colorFacet = new Map<string, { name: string; hex: string }>();
  for (const p of all) {
    for (const s of p.sizes) sizeFacet.set(s.label, s);
    for (const c of p.colors) colorFacet.set(c.name, c);
  }
  const prices = all.map((p) => p.priceCents);

  const filtered = all.filter(
    (p) =>
      (f.minCents === null || p.priceCents >= f.minCents) &&
      (f.maxCents === null || p.priceCents <= f.maxCents) &&
      matchesVariantFilters(p, f),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);

  return {
    category,
    categories: categories.map((c) => ({ name: c.name, slug: c.slug, count: c._count.products })),
    facets: {
      sizes: [...sizeFacet.values()].sort((a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind.localeCompare(b.kind))),
      colors: [...colorFacet.values()],
      minCents: prices.length ? Math.min(...prices) : 0,
      maxCents: prices.length ? Math.max(...prices) : 0,
    },
    products: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: filtered.length,
    page,
    pages,
  };
}

/** Ficha de producto con sus variantes y relacionados. */
export async function getProduct(tenantId: string, slug: string) {
  const tdb = tenantDb(tenantId);
  const rules = await getStoreSettings(tenantId);
  const p = await tdb.product.findFirst({
    where: { ...visible(), slug },
    select: { ...cardSelect, description: true, details: true, categoryId: true, seoTitle: true, seoDescription: true, category: { select: { name: true, slug: true } } },
  });
  if (!p) return null;
  const related = await tdb.product.findMany({
    where: { ...visible(), categoryId: p.categoryId, NOT: { id: p.id } },
    orderBy: { sortOrder: "asc" },
    take: 4,
    select: cardSelect,
  });
  return {
    card: toCard(p, rules),
    description: p.description,
    details: p.details,
    categorySlug: p.category.slug,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    related: related.map((r) => toCard(r, rules)),
  };
}

/** Autocompletado del buscador. */
export async function searchSuggestions(tenantId: string, q: string) {
  const term = q.trim();
  if (term.length < 2) return { products: [], categories: [] };
  const tdb = tenantDb(tenantId);
  const [products, categories] = await Promise.all([
    tdb.product.findMany({
      where: { ...visible(), OR: [{ name: { contains: term, mode: "insensitive" } }, { tags: { has: term.toLowerCase() } }] },
      take: 6,
      orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
      select: { slug: true, name: true, priceUsd: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
    }),
    tdb.category.findMany({ where: { isActive: true, name: { contains: term, mode: "insensitive" } }, take: 3, select: { slug: true, name: true } }),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, name: p.name, priceCents: toCents(p.priceUsd), imageUrl: p.images[0]?.url ?? null })),
    categories,
  };
}

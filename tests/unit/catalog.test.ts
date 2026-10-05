import { describe, expect, it } from "vitest";
import { badgesFor, isAvailable, matchesVariantFilters, parseFilters, type ProductCardData } from "@/lib/catalog";
import { parseRate } from "@/lib/rates";

const rules = { newProductDays: 30, lowStockThreshold: 3, freeShippingFromCents: 6000 };
const now = new Date("2026-10-04T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("etiquetas de la tarjeta", () => {
  it("nuevo, descuento, envío gratis y últimas unidades", () => {
    const b = badgesFor({ publishedAt: daysAgo(2), compareAtCents: 5000, priceCents: 4000, freeShipping: false, badge: null, totalAvailable: 2 }, { ...rules, freeShippingFromCents: 3000 }, now);
    expect(b.map((x) => x.label)).toEqual(["Nuevo", "-20%", "Envío gratis"]);
  });
  it("agotado manda sobre todo", () => {
    expect(badgesFor({ publishedAt: daysAgo(1), compareAtCents: null, priceCents: 1000, freeShipping: true, badge: "Promoción", totalAvailable: 0 }, rules, now)).toEqual([{ kind: "sold-out", label: "Agotado" }]);
  });
  it("la etiqueta manual reemplaza el % de descuento", () => {
    expect(badgesFor({ publishedAt: daysAgo(90), compareAtCents: 5000, priceCents: 4000, freeShipping: false, badge: "Promoción", totalAvailable: 9 }, rules, now).map((x) => x.label)).toEqual(["Promoción"]);
  });
});

const product: ProductCardData = {
  id: "p",
  slug: "p",
  name: "Vestido",
  category: "Vestidos",
  priceCents: 3800,
  compareAtCents: null,
  badges: [],
  images: [],
  sizes: [
    { id: "s", label: "S", kind: "CLOTHING", sortOrder: 1 },
    { id: "m", label: "M", kind: "CLOTHING", sortOrder: 2 },
  ],
  colors: [
    { id: "negro", name: "Negro", hex: "#000" },
    { id: "lila", name: "Lila", hex: "#B48AD8" },
  ],
  variants: [
    { id: "1", sizeId: "s", colorId: "negro", available: 0, priceCents: 3800 },
    { id: "2", sizeId: "m", colorId: "negro", available: 2, priceCents: 3800 },
    { id: "3", sizeId: "s", colorId: "lila", available: 1, priceCents: 3800 },
  ],
  totalAvailable: 3,
};

describe("filtros por variante", () => {
  it("talla y color deben coincidir en la MISMA variante con stock", () => {
    expect(matchesVariantFilters(product, { sizes: ["S"], colors: ["Negro"], onlyAvailable: true })).toBe(false);
    expect(matchesVariantFilters(product, { sizes: ["S"], colors: ["Lila"], onlyAvailable: true })).toBe(true);
    expect(matchesVariantFilters(product, { sizes: ["M"], colors: [], onlyAvailable: false })).toBe(true);
  });
  it("disponibilidad por talla y color", () => {
    expect(isAvailable(product.variants, "s", "negro")).toBe(false);
    expect(isAvailable(product.variants, null, "negro")).toBe(true);
  });
  it("lee los filtros de la URL, con precio en bolívares", () => {
    const f = parseFilters({ talla: ["S", "M"], color: "Lila", min: "3.650", max: "7300", moneda: "bs", orden: "nuevos" }, 182.5);
    expect(f.sizes).toEqual(["S", "M"]);
    expect(f.colors).toEqual(["Lila"]);
    expect(f.minCents).toBe(2000); // 3.650 Bs / 182,5 = $20
    expect(f.maxCents).toBe(4000);
    expect(f.sort).toBe("nuevos");
  });
});

describe("tasas", () => {
  it("entiende el formato venezolano", () => {
    expect(parseRate("182,25")).toBe(182.25);
    expect(parseRate("1.182,5")).toBe(1182.5);
    expect(parseRate("182.25")).toBe(182.25);
    expect(parseRate("abc")).toBeNull();
    expect(parseRate("0")).toBeNull();
  });
});

import { tenantDb } from "@/server/db";
import { centsToDecimalString, toCents } from "@/lib/money";
import type { FormVariant, ProductFormData } from "@/components/admin/product-form";

/** Catálogo base del formulario: categorías, tallas y colores del negocio. */
export async function getCatalogOptions(tenantId: string) {
  const tdb = tenantDb(tenantId);
  const [categories, sizes, colors] = await Promise.all([
    tdb.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    tdb.size.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { id: true, label: true, kind: true, sortOrder: true } }),
    tdb.color.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, hex: true } }),
  ]);
  return { categories, sizes, colors };
}

/** "25.00" → "25,00" (como se escribe en Venezuela). */
const decimal = (v: { toString(): string } | null) => (v === null ? "" : centsToDecimalString(toCents(v)).replace(".", ","));

export async function getProductForEdit(tenantId: string, id: string) {
  const tdb = tenantDb(tenantId);
  const p = await tdb.product.findFirst({
    where: { id },
    include: {
      variants: { where: { isActive: true }, select: { id: true, sizeId: true, colorId: true, stock: true, reserved: true, sku: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, url: true, alt: true, colorId: true } },
    },
  });
  if (!p) return null;
  const movements = await tdb.stockMovement.findMany({
    where: { variant: { productId: id } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      type: true,
      quantity: true,
      stockAfter: true,
      reason: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      order: { select: { id: true, number: true } },
      variant: { select: { sku: true, size: { select: { label: true } }, color: { select: { name: true } } } },
    },
  });
  const product: ProductFormData = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    categoryId: p.categoryId,
    description: p.description ?? "",
    details: p.details ?? "",
    gender: p.gender,
    price: decimal(p.priceUsd),
    compareAt: decimal(p.compareAtUsd),
    cost: decimal(p.costUsd),
    ivaExempt: p.ivaExempt,
    freeShipping: p.freeShipping,
    badge: p.badge ?? "",
    tags: p.tags.join(", "),
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
  };
  const variants: FormVariant[] = p.variants.map((v) => ({ sizeId: v.sizeId, colorId: v.colorId, stock: v.stock, reserved: v.reserved, sku: v.sku }));
  return { product, variants, images: p.images, movements, skus: p.variants };
}

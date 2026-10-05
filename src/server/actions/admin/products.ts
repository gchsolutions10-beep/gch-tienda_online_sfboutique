"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StockMovementType } from "@/generated/prisma/enums";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { requireStaff } from "@/server/auth/guards";
import { saveMedia, deleteMedia } from "@/server/services/media";
import { centsToDecimalString, parseAmount } from "@/lib/money";
import { planVariants } from "@/lib/variants";
import { skuFor } from "@/lib/orders";
import { uniqueSlug } from "@/lib/slug";
import { isHexColor } from "@/lib/files";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Dueña y encargada cargan productos y stock. */
const CATALOG_ROLES = ["TENANT_ADMIN", "BRANCH_ADMIN"] as const;

async function catalogStaff() {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, [...CATALOG_ROLES], "/admin/productos");
  return { tenant, ctx, tdb: tenantDb(tenant.id) };
}

function revalidateCatalog() {
  revalidatePath("/t/[domain]", "layout");
}

const money = (required: boolean) =>
  z.string().max(20).transform((s, ctx) => {
    if (!s.trim()) {
      if (required) ctx.addIssue({ code: "custom", message: "Escribe el precio" });
      return null;
    }
    const n = parseAmount(s);
    if (n === null || n > 100_000) {
      ctx.addIssue({ code: "custom", message: `Monto inválido: ${s}` });
      return null;
    }
    return Math.round(n * 100);
  });

const productInput = z.object({
  id: z.string().max(40).nullable(),
  name: z.string().trim().min(2, "Escribe el nombre").max(120),
  categoryId: z.string().min(5, "Elige la categoría").max(40),
  description: z.string().trim().max(3000),
  details: z.string().trim().max(2000),
  gender: z.enum(["WOMEN", "MEN", "UNISEX", "KIDS"]),
  price: money(true),
  compareAt: money(false),
  cost: money(false),
  ivaExempt: z.boolean(),
  freeShipping: z.boolean(),
  badge: z.string().trim().max(30),
  tags: z.string().trim().max(300),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(170),
  stockReason: z.enum(["PURCHASE", "ADJUSTMENT", "DAMAGE"]),
  stockNote: z.string().trim().max(160),
  cells: z
    .array(
      z.object({
        sizeId: z.string().max(40).nullable(),
        colorId: z.string().max(40).nullable(),
        expectedStock: z.number().int().min(0).max(100_000),
        stock: z.number().int().min(0, "El stock no puede ser negativo").max(100_000),
      }),
    )
    .max(300),
});

/** Crea o actualiza un producto con su matriz talla × color y el stock de cada variante. */
export async function saveProduct(raw: unknown): Promise<Result<{ id: string }>> {
  const { tenant, ctx, tdb } = await catalogStaff();
  const parsed = productInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  if (!d.cells.length) return { ok: false, error: "Elige al menos una talla o un color (o «Talla única»)" };
  if (d.compareAt !== null && d.price !== null && d.compareAt <= d.price) return { ok: false, error: "El precio «antes» debe ser mayor que el precio actual" };

  // Las tallas, colores y la categoría deben ser de este negocio.
  const sizeIds = [...new Set(d.cells.map((c) => c.sizeId).filter((x): x is string => Boolean(x)))];
  const colorIds = [...new Set(d.cells.map((c) => c.colorId).filter((x): x is string => Boolean(x)))];
  const [category, sizes, colors] = await Promise.all([
    tdb.category.findFirst({ where: { id: d.categoryId }, select: { id: true } }),
    tdb.size.findMany({ where: { id: { in: sizeIds } }, select: { id: true, label: true } }),
    tdb.color.findMany({ where: { id: { in: colorIds } }, select: { id: true, name: true } }),
  ]);
  if (!category || sizes.length !== sizeIds.length || colors.length !== colorIds.length) return { ok: false, error: "Datos del catálogo inválidos. Recarga la página." };
  const sizeLabel = new Map(sizes.map((s) => [s.id, s.label]));
  const colorName = new Map(colors.map((c) => [c.id, c.name]));

  const data = {
    name: d.name,
    categoryId: d.categoryId,
    description: d.description || null,
    details: d.details || null,
    gender: d.gender,
    priceUsd: centsToDecimalString(d.price!),
    compareAtUsd: d.compareAt === null ? null : centsToDecimalString(d.compareAt),
    costUsd: d.cost === null ? null : centsToDecimalString(d.cost),
    ivaExempt: d.ivaExempt,
    freeShipping: d.freeShipping,
    badge: d.badge || null,
    tags: [...new Set(d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    isActive: d.isActive,
    isFeatured: d.isFeatured,
    seoTitle: d.seoTitle || null,
    seoDescription: d.seoDescription || null,
  };

  try {
    const id = await tdb.$transaction(async (tx) => {
      let productId = d.id;
      if (productId) {
        const exists = await tx.product.findFirst({ where: { id: productId }, select: { id: true } });
        if (!exists) throw new Error("NOT_FOUND");
        await tx.product.update({ where: { id: productId }, data });
      } else {
        const slug = await uniqueSlug(d.name, async (s) => Boolean(await tx.product.findFirst({ where: { slug: s }, select: { id: true } })));
        productId = (await tx.product.create({ data: { ...data, tenantId: tenant.id, slug }, select: { id: true } })).id;
      }

      const existing = await tx.productVariant.findMany({
        where: { productId },
        select: { id: true, sizeId: true, colorId: true, stock: true, reserved: true, isActive: true, _count: { select: { orderItems: true } } },
      });
      const plan = planVariants(
        existing.map((v) => ({ ...v, sold: v._count.orderItems > 0 })),
        d.cells,
      );
      if (plan.errors.length) throw new Error(`PLAN:${plan.errors[0]}`);

      const type = d.stockReason as StockMovementType;
      const reason = d.stockNote || null;
      for (const u of plan.update) {
        const v = await tx.productVariant.update({
          where: { id: u.id },
          data: { stock: { increment: u.delta }, ...(u.reactivate ? { isActive: true } : {}) },
          select: { stock: true },
        });
        if (u.delta !== 0) {
          await tx.stockMovement.create({
            data: { tenantId: tenant.id, variantId: u.id, type: type === "DAMAGE" && u.delta > 0 ? "ADJUSTMENT" : type, quantity: u.delta, stockAfter: v.stock, reason, userId: ctx.user.id },
          });
        }
      }
      for (const r of plan.remove) {
        if (!r.hasSales) {
          await tx.productVariant.delete({ where: { id: r.id } });
          continue;
        }
        // Con ventas: se desactiva (el historial la necesita) y sus unidades salen del inventario.
        await tx.productVariant.update({ where: { id: r.id }, data: { isActive: false, stock: 0 } });
        if (r.stock > 0) {
          await tx.stockMovement.create({
            data: { tenantId: tenant.id, variantId: r.id, type: "ADJUSTMENT", quantity: -r.stock, stockAfter: 0, reason: "Talla o color retirado del producto", userId: ctx.user.id },
          });
        }
      }
      const product = await tx.product.findFirstOrThrow({ where: { id: productId }, select: { name: true } });
      for (const c of plan.create) {
        // SKU automático y único en el negocio.
        const base = skuFor(product.name, c.colorId ? colorName.get(c.colorId)! : null, c.sizeId ? sizeLabel.get(c.sizeId)! : null);
        let sku = base;
        for (let i = 2; await tx.productVariant.findFirst({ where: { sku }, select: { id: true } }); i++) sku = `${base}-${i}`;
        const v = await tx.productVariant.create({
          data: { tenantId: tenant.id, productId, sizeId: c.sizeId, colorId: c.colorId, sku, stock: c.stock },
          select: { id: true },
        });
        if (c.stock > 0) {
          await tx.stockMovement.create({
            data: { tenantId: tenant.id, variantId: v.id, type: "PURCHASE", quantity: c.stock, stockAfter: c.stock, reason: reason ?? "Stock inicial", userId: ctx.user.id },
          });
        }
      }
      return productId;
    });
    revalidateCatalog();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("PLAN:")) return { ok: false, error: e.message.slice(5) };
    if (e instanceof Error && e.message === "NOT_FOUND") return { ok: false, error: "El producto ya no existe" };
    throw e;
  }
}

/** Mostrar u ocultar en la tienda desde la lista. */
export async function setProductActive(id: string, isActive: boolean): Promise<Result> {
  const { tdb } = await catalogStaff();
  await tdb.product.updateMany({ where: { id }, data: { isActive } });
  revalidateCatalog();
  return { ok: true };
}

// ───────────────────────────── Fotos ─────────────────────────────

async function ownImage(tdb: ReturnType<typeof tenantDb>, imageId: string) {
  const img = await tdb.product.findFirst({ where: { images: { some: { id: imageId } } }, select: { id: true } });
  return img ? img.id : null;
}

/** Sube una foto vertical (ya reducida en el navegador) y la asocia a un color opcional. */
export async function uploadProductImage(formData: FormData): Promise<Result> {
  const { tenant, tdb } = await catalogStaff();
  const productId = String(formData.get("productId") ?? "");
  const colorId = String(formData.get("colorId") ?? "") || null;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige una foto" };
  const product = await tdb.product.findFirst({ where: { id: productId }, select: { id: true, name: true, _count: { select: { images: true } } } });
  if (!product) return { ok: false, error: "Producto no encontrado" };
  if (product._count.images >= 12) return { ok: false, error: "Máximo 12 fotos por producto" };
  if (colorId && !(await tdb.color.findFirst({ where: { id: colorId }, select: { id: true } }))) return { ok: false, error: "Color inválido" };

  const result = await tdb.$transaction(async (tx) => {
    const img = await tx.productImage.create({
      data: { productId: product.id, colorId, url: "", alt: product.name, sortOrder: product._count.images },
      select: { id: true },
    });
    const saved = await saveMedia(tx, tenant.id, "producto", img.id, file);
    if (!saved.ok) throw new Error(`MEDIA:${saved.error}`);
    await tx.productImage.update({ where: { id: img.id }, data: { url: saved.url } });
    return saved;
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message.startsWith("MEDIA:")) return { ok: false as const, error: e.message.slice(6) };
    throw e;
  });
  if (!result.ok) return result;
  revalidateCatalog();
  return { ok: true };
}

export async function updateProductImage(imageId: string, raw: { colorId: string | null; alt: string }): Promise<Result> {
  const { tdb } = await catalogStaff();
  if (!(await ownImage(tdb, imageId))) return { ok: false, error: "Foto no encontrada" };
  if (raw.colorId && !(await tdb.color.findFirst({ where: { id: raw.colorId }, select: { id: true } }))) return { ok: false, error: "Color inválido" };
  await tdb.productImage.update({ where: { id: imageId }, data: { colorId: raw.colorId || null, alt: String(raw.alt ?? "").trim().slice(0, 120) || null } });
  revalidateCatalog();
  return { ok: true };
}

/** Mueve una foto a la izquierda o a la derecha (la primera es la principal; la segunda, la del hover). */
export async function moveProductImage(imageId: string, direction: -1 | 1): Promise<Result> {
  const { tdb } = await catalogStaff();
  const productId = await ownImage(tdb, imageId);
  if (!productId) return { ok: false, error: "Foto no encontrada" };
  const images = await tdb.productImage.findMany({ where: { productId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  const i = images.findIndex((x) => x.id === imageId);
  const j = i + direction;
  if (j < 0 || j >= images.length) return { ok: true };
  [images[i], images[j]] = [images[j], images[i]];
  await tdb.$transaction(images.map((img, n) => tdb.productImage.update({ where: { id: img.id }, data: { sortOrder: n } })));
  revalidateCatalog();
  return { ok: true };
}

export async function deleteProductImage(imageId: string): Promise<Result> {
  const { tdb } = await catalogStaff();
  if (!(await ownImage(tdb, imageId))) return { ok: false, error: "Foto no encontrada" };
  await tdb.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    await deleteMedia(tx, "producto", imageId);
  });
  revalidateCatalog();
  return { ok: true };
}

// ─────────────────────── Colores y tallas ───────────────────────

export async function createColor(name: string, hex: string): Promise<Result<{ color: { id: string; name: string; hex: string } }>> {
  const { tdb, tenant } = await catalogStaff();
  const clean = String(name ?? "").trim().slice(0, 30);
  if (clean.length < 2) return { ok: false, error: "Escribe el nombre del color" };
  if (!isHexColor(hex)) return { ok: false, error: "Elige el tono del color" };
  const exists = await tdb.color.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true } });
  if (exists) return { ok: false, error: "Ese color ya existe" };
  const max = await tdb.color.aggregate({ _max: { sortOrder: true } });
  const color = await tdb.color.create({
    data: { tenantId: tenant.id, name: clean, hex: hex.toUpperCase(), sortOrder: (max._max.sortOrder ?? 0) + 1 },
    select: { id: true, name: true, hex: true },
  });
  return { ok: true, color };
}

export async function createSize(label: string, kind: "CLOTHING" | "SHOE" | "ONE_SIZE" | "OTHER"): Promise<Result<{ size: { id: string; label: string; kind: string; sortOrder: number } }>> {
  const { tdb, tenant } = await catalogStaff();
  const clean = String(label ?? "").trim().toUpperCase().slice(0, 12);
  if (!clean) return { ok: false, error: "Escribe la talla" };
  if (!["CLOTHING", "SHOE", "ONE_SIZE", "OTHER"].includes(kind)) return { ok: false, error: "Tipo inválido" };
  const exists = await tdb.size.findFirst({ where: { kind, label: clean }, select: { id: true } });
  if (exists) return { ok: false, error: "Esa talla ya existe" };
  const max = await tdb.size.aggregate({ where: { kind }, _max: { sortOrder: true } });
  const size = await tdb.size.create({
    data: { tenantId: tenant.id, label: clean, kind, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    select: { id: true, label: true, kind: true, sortOrder: true },
  });
  return { ok: true, size };
}


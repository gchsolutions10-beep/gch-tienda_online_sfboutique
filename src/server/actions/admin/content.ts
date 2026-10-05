"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { CONTENT_ROLES, requireStaff } from "@/server/auth/guards";
import { deleteMedia, saveMedia } from "@/server/services/media";
import { autoExcerpt, caracasDateTime, caracasDay, isSafeLink, parseTags, readingMinutes } from "@/lib/blog";
import { slugify, uniqueSlug } from "@/lib/slug";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Blog, portada y banners: la dueña y quien tenga el rol de contenido. */
async function contentStaff(path = "/admin/blog") {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, CONTENT_ROLES, path);
  return { tenant, ctx, tdb: tenantDb(tenant.id) };
}

function revalidateStore() {
  revalidatePath("/t/[domain]", "layout");
}

const id = z.string().min(5).max(40);

// ───────────────────────────── Blog ─────────────────────────────

const postInput = z.object({
  id: id.nullable(),
  title: z.string().trim().min(3, "Escribe el título").max(140),
  slug: z.string().trim().max(120),
  categoryId: z.string().max(40),
  excerpt: z.string().trim().max(300),
  content: z.string().max(60_000),
  tags: z.string().max(300),
  seoTitle: z.string().trim().max(120),
  seoDescription: z.string().trim().max(300),
  /** draft = borrador · now = publicar ya · schedule = publicar en publishAt */
  publish: z.enum(["draft", "now", "schedule"]),
  publishAt: z.string().max(20),
  products: z.array(z.object({ productId: id, note: z.string().trim().max(120) })).max(12),
});

/** Crea o edita un artículo. Programado = publicado con fecha futura (sale solo ese día). */
export async function savePost(raw: unknown): Promise<Result<{ id: string; slug: string }>> {
  const { tenant, ctx, tdb } = await contentStaff();
  const parsed = postInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el artículo" };
  const d = parsed.data;
  if (d.publish !== "draft" && d.content.trim().length < 20) return { ok: false, error: "El artículo está casi vacío: escribe el contenido antes de publicar" };

  const existing = d.id ? await tdb.blogPost.findFirst({ where: { id: d.id }, select: { id: true, slug: true, status: true, publishedAt: true } }) : null;
  if (d.id && !existing) return { ok: false, error: "El artículo ya no existe" };

  let publishedAt: Date | null = null;
  if (d.publish === "now") {
    // Si ya estaba publicado, conserva su fecha original.
    publishedAt = existing?.status === "PUBLISHED" && existing.publishedAt && existing.publishedAt <= new Date() ? existing.publishedAt : new Date();
  } else if (d.publish === "schedule") {
    publishedAt = caracasDateTime(d.publishAt);
    if (!publishedAt) return { ok: false, error: "Elige la fecha y hora de publicación" };
    if (publishedAt <= new Date()) return { ok: false, error: "La fecha programada ya pasó: elige una futura o publica ahora" };
  }

  const categoryId = d.categoryId || null;
  if (categoryId && !(await tdb.blogCategory.findFirst({ where: { id: categoryId }, select: { id: true } }))) return { ok: false, error: "Categoría inválida" };
  const productIds = [...new Set(d.products.map((p) => p.productId))];
  if (productIds.length && (await tdb.product.count({ where: { id: { in: productIds } } })) !== productIds.length) return { ok: false, error: "Un producto enlazado ya no existe" };

  const wanted = slugify(d.slug || d.title) || "articulo";
  const slug =
    existing && existing.slug === wanted
      ? wanted
      : await uniqueSlug(wanted, async (s) => Boolean(await tdb.blogPost.findFirst({ where: { slug: s, NOT: existing ? { id: existing.id } : undefined }, select: { id: true } })));

  const data = {
    title: d.title,
    slug,
    categoryId,
    excerpt: d.excerpt || autoExcerpt(d.content) || null,
    content: d.content,
    tags: parseTags(d.tags),
    status: d.publish === "draft" ? ("DRAFT" as const) : ("PUBLISHED" as const),
    publishedAt,
    readingMinutes: readingMinutes(d.content),
    seoTitle: d.seoTitle || null,
    seoDescription: d.seoDescription || null,
  };
  const links = d.products.filter((p, i) => d.products.findIndex((x) => x.productId === p.productId) === i);

  const post = await tdb.$transaction(async (tx) => {
    const saved = existing
      ? await tx.blogPost.update({ where: { id: existing.id }, data, select: { id: true, slug: true } })
      : await tx.blogPost.create({ data: { ...data, tenantId: tenant.id, authorId: ctx.user.id }, select: { id: true, slug: true } });
    await tx.blogPostProduct.deleteMany({ where: { postId: saved.id } });
    if (links.length) {
      await tx.blogPostProduct.createMany({ data: links.map((l, i) => ({ postId: saved.id, productId: l.productId, sortOrder: i, note: l.note || null })) });
    }
    return saved;
  });
  revalidateStore();
  return { ok: true, id: post.id, slug: post.slug };
}

export async function deletePost(postId: string): Promise<Result> {
  const { tdb } = await contentStaff();
  if (!id.safeParse(postId).success) return { ok: false, error: "Artículo inválido" };
  const post = await tdb.blogPost.findFirst({ where: { id: postId }, select: { id: true } });
  if (!post) return { ok: false, error: "El artículo ya no existe" };
  await tdb.$transaction([
    // Portada y fotos dentro del artículo (blog-<id>…).
    tdb.tenantAsset.deleteMany({ where: { kind: { startsWith: `blog-${post.id}` } } }),
    tdb.blogPost.delete({ where: { id: post.id } }),
  ]);
  revalidateStore();
  return { ok: true };
}

/**
 * Sube la portada del artículo (kind=cover) o una foto para el contenido
 * (kind=inline: devuelve la URL para insertarla como ![…](url)).
 */
export async function uploadPostImage(formData: FormData): Promise<Result<{ url: string }>> {
  const { tenant, tdb } = await contentStaff();
  const postId = String(formData.get("postId") ?? "");
  const kind = formData.get("kind") === "inline" ? "inline" : "cover";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige una imagen" };
  const post = await tdb.blogPost.findFirst({ where: { id: postId }, select: { id: true } });
  if (!post) return { ok: false, error: "Guarda el artículo antes de subir fotos" };
  const key = kind === "cover" ? post.id : `${post.id}i${randomBytes(4).toString("hex")}`;
  const saved = await saveMedia(tdb, tenant.id, "blog", key, file);
  if (!saved.ok) return saved;
  if (kind === "cover") await tdb.blogPost.updateMany({ where: { id: post.id }, data: { coverImageUrl: saved.url } });
  revalidateStore();
  return { ok: true, url: saved.url };
}

export async function removePostCover(postId: string): Promise<Result> {
  const { tdb } = await contentStaff();
  const post = await tdb.blogPost.findFirst({ where: { id: postId }, select: { id: true } });
  if (!post) return { ok: false, error: "El artículo ya no existe" };
  await deleteMedia(tdb, "blog", post.id);
  await tdb.blogPost.updateMany({ where: { id: post.id }, data: { coverImageUrl: null } });
  revalidateStore();
  return { ok: true };
}

/** Productos para "Consigue este look". */
export async function searchProductsForPost(q: string) {
  const { tdb } = await contentStaff();
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return tdb.product.findMany({
    where: { OR: [{ name: { contains: term, mode: "insensitive" } }, { variants: { some: { sku: { contains: term, mode: "insensitive" } } } }] },
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, name: true, isActive: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
  });
}

const categoryInput = z.object({ id: id.nullable(), name: z.string().trim().min(2, "Escribe el nombre").max(40) });

export async function saveBlogCategory(raw: unknown): Promise<Result> {
  const { tenant, tdb } = await contentStaff();
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el nombre" };
  const { id: catId, name } = parsed.data;
  const slug = await uniqueSlug(slugify(name) || "categoria", async (s) => Boolean(await tdb.blogCategory.findFirst({ where: { slug: s, NOT: catId ? { id: catId } : undefined }, select: { id: true } })));
  if (catId) {
    const r = await tdb.blogCategory.updateMany({ where: { id: catId }, data: { name, slug } });
    if (!r.count) return { ok: false, error: "La categoría ya no existe" };
  } else {
    const max = await tdb.blogCategory.aggregate({ _max: { sortOrder: true } });
    await tdb.blogCategory.create({ data: { tenantId: tenant.id, name, slug, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  revalidateStore();
  return { ok: true };
}

/** Borra una categoría; sus artículos quedan sin categoría. */
export async function deleteBlogCategory(categoryId: string): Promise<Result> {
  const { tdb } = await contentStaff();
  const r = await tdb.blogCategory.deleteMany({ where: { id: categoryId } });
  if (!r.count) return { ok: false, error: "La categoría ya no existe" };
  revalidateStore();
  return { ok: true };
}

// ───────────────────────────── Portada ─────────────────────────────

const link = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || isSafeLink(v), "El enlace debe ser una ruta de la tienda (/catalogo?…) o empezar por https://");

const heroInput = z.object({
  id: id.nullable(),
  title: z.string().trim().min(2, "Escribe el título").max(60),
  subtitle: z.string().trim().max(80),
  linkUrl: link.refine((v) => Boolean(v), "Escribe a dónde lleva la tarjeta"),
  isActive: z.boolean(),
});

/** Tarjetas grandes de la portada (máximo 4 activas). */
export async function saveHeroCard(raw: unknown): Promise<Result<{ id: string }>> {
  const { tenant, tdb } = await contentStaff("/admin/portada");
  const parsed = heroInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la tarjeta" };
  const d = parsed.data;
  const data = { title: d.title, subtitle: d.subtitle || null, linkUrl: d.linkUrl, isActive: d.isActive };
  if (d.isActive && (await tdb.heroCard.count({ where: { isActive: true, NOT: d.id ? { id: d.id } : undefined } })) >= 4) {
    return { ok: false, error: "La portada muestra hasta 4 tarjetas: desactiva otra primero" };
  }
  let cardId = d.id;
  if (d.id) {
    const r = await tdb.heroCard.updateMany({ where: { id: d.id }, data });
    if (!r.count) return { ok: false, error: "La tarjeta ya no existe" };
  } else {
    const max = await tdb.heroCard.aggregate({ _max: { sortOrder: true } });
    cardId = (await tdb.heroCard.create({ data: { ...data, tenantId: tenant.id, sortOrder: (max._max.sortOrder ?? 0) + 1 }, select: { id: true } })).id;
  }
  revalidateStore();
  return { ok: true, id: cardId! };
}

const bannerInput = z.object({
  id: id.nullable(),
  title: z.string().trim().min(2, "Escribe un título (también lo leen los lectores de pantalla)").max(80),
  linkUrl: link,
  startsAt: z.string().max(10),
  endsAt: z.string().max(10),
  isActive: z.boolean(),
});

/** Banners de promociones con fechas: puedes dejar listos los del mes que viene. */
export async function saveBanner(raw: unknown): Promise<Result<{ id: string }>> {
  const { tenant, tdb } = await contentStaff("/admin/portada");
  const parsed = bannerInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el banner" };
  const d = parsed.data;
  const startsAt = caracasDay(d.startsAt);
  const endsAt = caracasDay(d.endsAt, true);
  if (!startsAt || !endsAt) return { ok: false, error: "Elige las fechas desde y hasta" };
  if (endsAt < startsAt) return { ok: false, error: "La fecha final debe ser después de la inicial" };
  const data = { title: d.title, linkUrl: d.linkUrl || null, startsAt, endsAt, isActive: d.isActive };
  if (d.id) {
    const r = await tdb.promoBanner.updateMany({ where: { id: d.id }, data });
    if (!r.count) return { ok: false, error: "El banner ya no existe" };
    revalidateStore();
    return { ok: true, id: d.id };
  }
  const max = await tdb.promoBanner.aggregate({ _max: { sortOrder: true } });
  // La imagen se sube enseguida; mientras tanto el banner queda inactivo.
  const created = await tdb.promoBanner.create({ data: { ...data, tenantId: tenant.id, imageUrl: "", isActive: false, sortOrder: (max._max.sortOrder ?? 0) + 1 }, select: { id: true } });
  revalidateStore();
  return { ok: true, id: created.id };
}

/** Imagen de una tarjeta de portada (kind=portada) o de un banner (kind=banner). */
export async function uploadHomeImage(formData: FormData): Promise<Result> {
  const { tenant, tdb } = await contentStaff("/admin/portada");
  const kind = formData.get("kind") === "banner" ? "banner" : "portada";
  const itemId = String(formData.get("id") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige una imagen" };
  const exists =
    kind === "banner"
      ? await tdb.promoBanner.findFirst({ where: { id: itemId }, select: { id: true, imageUrl: true } })
      : await tdb.heroCard.findFirst({ where: { id: itemId }, select: { id: true, imageUrl: true } });
  if (!exists) return { ok: false, error: "Guarda primero los datos" };
  const saved = await saveMedia(tdb, tenant.id, kind, exists.id, file);
  if (!saved.ok) return saved;
  if (kind === "banner") {
    // Un banner nuevo se activa al tener su imagen.
    await tdb.promoBanner.updateMany({ where: { id: exists.id }, data: { imageUrl: saved.url, ...(exists.imageUrl ? {} : { isActive: true }) } });
  } else {
    await tdb.heroCard.updateMany({ where: { id: exists.id }, data: { imageUrl: saved.url } });
  }
  revalidateStore();
  return { ok: true };
}

export async function moveHomeItem(kind: "hero" | "banner", itemId: string, direction: -1 | 1): Promise<Result> {
  const { tdb } = await contentStaff("/admin/portada");
  const list =
    kind === "hero"
      ? await tdb.heroCard.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } })
      : await tdb.promoBanner.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
  const i = list.findIndex((x) => x.id === itemId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await tdb.$transaction(
    list.map((x, n) => (kind === "hero" ? tdb.heroCard.updateMany({ where: { id: x.id }, data: { sortOrder: n } }) : tdb.promoBanner.updateMany({ where: { id: x.id }, data: { sortOrder: n } }))),
  );
  revalidateStore();
  return { ok: true };
}

export async function deleteHomeItem(kind: "hero" | "banner", itemId: string): Promise<Result> {
  const { tdb } = await contentStaff("/admin/portada");
  if (!id.safeParse(itemId).success) return { ok: false, error: "Inválido" };
  const r = kind === "hero" ? await tdb.heroCard.deleteMany({ where: { id: itemId } }) : await tdb.promoBanner.deleteMany({ where: { id: itemId } });
  if (!r.count) return { ok: false, error: "Ya no existe" };
  await deleteMedia(tdb, kind === "hero" ? "portada" : "banner", itemId);
  revalidateStore();
  return { ok: true };
}

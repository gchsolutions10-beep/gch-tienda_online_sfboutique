import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { getDisplayRate, getProduct } from "@/server/queries/store";
import { Markdown } from "@/components/markdown";
import { ProductCard } from "@/components/store/product-card";

async function loadPost(tenantId: string, slug: string) {
  return tenantDb(tenantId).blogPost.findFirst({
    where: { slug, status: "PUBLISHED", publishedAt: { lte: new Date() } },
    select: {
      title: true,
      excerpt: true,
      content: true,
      coverImageUrl: true,
      publishedAt: true,
      readingMinutes: true,
      tags: true,
      seoTitle: true,
      seoDescription: true,
      category: { select: { name: true, slug: true } },
      author: { select: { name: true } },
      products: { orderBy: { sortOrder: "asc" }, select: { note: true, product: { select: { slug: true } } } },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/t/[domain]/blog/[slug]">) {
  const { domain, slug } = await params;
  const tenant = await getTenant(domain);
  const post = await loadPost(tenant.id, slug);
  if (!post) return { title: "Artículo no encontrado" };
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
    openGraph: { type: "article", images: post.coverImageUrl ? [post.coverImageUrl] : [] },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/t/[domain]/blog/[slug]">) {
  const { domain, slug } = await params;
  const tenant = await getTenant(domain);
  const post = await loadPost(tenant.id, slug);
  if (!post) notFound();
  const rate = await getDisplayRate(tenant.id);
  // "Consigue este look": productos enlazados (solo los que siguen a la venta).
  const look = (await Promise.all(post.products.map((l) => getProduct(tenant.id, l.product.slug)))).filter((p) => p !== null);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <nav aria-label="Ruta" className="text-xs text-store-muted">
        <Link href="/blog" className="hover:underline">
          Blog
        </Link>
        {post.category ? (
          <>
            {" "}
            /{" "}
            <Link href={`/blog?categoria=${post.category.slug}`} className="hover:underline">
              {post.category.name}
            </Link>
          </>
        ) : null}
      </nav>
      <h1 className="mt-3 font-display text-5xl font-semibold leading-tight">{post.title}</h1>
      <p className="mt-3 text-sm text-store-muted">
        {post.publishedAt?.toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Caracas" })} · {post.readingMinutes} min de lectura
        {post.author?.name ? ` · ${post.author.name}` : ""}
      </p>
      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- portada del artículo
        <img src={post.coverImageUrl} alt="" className="mt-8 aspect-[16/10] w-full rounded-3xl object-cover" />
      ) : null}
      <div className="mt-8 text-lg">
        <Markdown source={post.content} />
      </div>
      {post.tags.length ? (
        <p className="mt-8 flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <span key={t} className="rounded-full bg-store-soft px-3 py-1 text-xs font-semibold">
              #{t}
            </span>
          ))}
        </p>
      ) : null}

      {look.length ? (
        <section aria-labelledby="look" className="mt-12 rounded-3xl bg-store-card p-6 shadow-sm">
          <h2 id="look" className="font-display text-3xl font-semibold">
            Consigue este look
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
            {look.map((p) => (
              <ProductCard key={p.card.id} product={p.card} rate={rate} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

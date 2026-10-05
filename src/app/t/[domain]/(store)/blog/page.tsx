import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { cn } from "@/components/ui/styles";

export const metadata = { title: "Blog · Tendencias y outfits" };

export default async function BlogPage({ params, searchParams }: PageProps<"/t/[domain]/blog">) {
  const tenant = await getTenant((await params).domain);
  const cat = (await searchParams).categoria;
  const tdb = tenantDb(tenant.id);
  const [categories, posts] = await Promise.all([
    tdb.blogCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true, slug: true } }),
    tdb.blogPost.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: new Date() }, ...(typeof cat === "string" ? { category: { slug: cat } } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: { slug: true, title: true, excerpt: true, coverImageUrl: true, publishedAt: true, readingMinutes: true, category: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Lookbook</p>
      <h1 className="font-display text-5xl font-semibold">Tendencias, outfits y novedades</h1>
      <nav aria-label="Temas" className="mt-6 flex flex-wrap gap-2">
        {[{ name: "Todo", slug: "" }, ...categories].map((c) => (
          <Link
            key={c.slug || "todo"}
            href={c.slug ? `/blog?categoria=${c.slug}` : "/blog"}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", (cat ?? "") === c.slug ? "bg-store-ink text-on-store-ink" : "bg-store-card hover:bg-store-soft")}
          >
            {c.name}
          </Link>
        ))}
      </nav>
      {posts.length === 0 ? <p className="mt-10 text-store-muted">Aún no hay artículos en este tema.</p> : null}
      <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="group block">
            <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-store-soft">
              {p.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- portada del artículo
                <img src={p.coverImageUrl} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
              ) : null}
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">
              {p.category?.name ?? "Blog"} · {p.readingMinutes} min
            </p>
            <h2 className="font-display text-2xl font-semibold group-hover:underline">{p.title}</h2>
            {p.excerpt ? <p className="mt-1 line-clamp-2 text-store-muted">{p.excerpt}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CONTENT_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { BlogCategories } from "@/components/admin/content-forms";
import { buttonPrimary, card, cn } from "@/components/ui/styles";
import { POST_STATE, postState } from "@/lib/blog";

export const metadata = { title: "Blog" };

export default async function BlogAdminPage({ params }: PageProps<"/t/[domain]/admin/blog">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CONTENT_ROLES, "/admin/blog");
  const tdb = tenantDb(tenant.id);
  const [posts, categories] = await Promise.all([
    tdb.blogPost.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        title: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        coverImageUrl: true,
        readingMinutes: true,
        category: { select: { name: true } },
        _count: { select: { products: true } },
      },
    }),
    tdb.blogCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, _count: { select: { posts: true } } } }),
  ]);
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleString("es-VE", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });

  return (
    <>
      <PageHeader
        title="Blog y lookbook"
        description="Artículos de tendencias y outfits con las prendas de la tienda. Puedes dejarlos programados."
        actions={<Link href="/admin/blog/nuevo" className={buttonPrimary}>+ Nuevo artículo</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className={cn(card, "overflow-hidden")}>
          {posts.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">Aún no hay artículos. ¡Escribe el primero!</p>
          ) : (
            <ul className="divide-y divide-line">
              {posts.map((p) => {
                const state = postState(p.status, p.publishedAt, now);
                return (
                  <li key={p.id}>
                    <Link href={`/admin/blog/${p.id}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-cream">
                      <span className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-cream">
                        {p.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura
                          <img src={p.coverImageUrl} alt="" className="size-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.title}</span>
                        <span className="block text-xs text-muted">
                          {[
                            p.category?.name,
                            `${p.readingMinutes} min`,
                            p._count.products ? `${p._count.products} prendas` : null,
                            state === "draft" ? `editado ${fmt(p.updatedAt)}` : p.publishedAt ? `${state === "scheduled" ? "sale el" : "publicado el"} ${fmt(p.publishedAt)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", POST_STATE[state].tone)}>{POST_STATE[state].label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <BlogCategories categories={categories.map((c) => ({ id: c.id, name: c.name, posts: c._count.posts }))} />
      </div>
    </>
  );
}

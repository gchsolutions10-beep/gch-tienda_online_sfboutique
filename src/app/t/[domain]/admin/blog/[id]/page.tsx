import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CONTENT_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { BlogEditor } from "@/components/admin/blog-editor";
import { POST_STATE, postState, toCaracasInput } from "@/lib/blog";
import { cn } from "@/components/ui/styles";

export const metadata = { title: "Editar artículo" };

export default async function EditPostPage({ params }: PageProps<"/t/[domain]/admin/blog/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, CONTENT_ROLES, `/admin/blog/${id}`);
  const tdb = tenantDb(tenant.id);
  const [post, categories] = await Promise.all([
    tdb.blogPost.findFirst({
      where: { id },
      include: {
        products: { orderBy: { sortOrder: "asc" }, select: { note: true, product: { select: { id: true, name: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } } },
        author: { select: { name: true, email: true } },
      },
    }),
    tdb.blogCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!post) notFound();
  const state = postState(post.status, post.publishedAt);
  const tomorrow = new Date(new Date().getTime() + 86_400_000);

  return (
    <>
      <Link href="/admin/blog" className="text-sm font-semibold text-muted hover:text-ink">← Blog</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">Editar artículo</h1>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", POST_STATE[state].tone)}>{POST_STATE[state].label}</span>
        {post.author ? <span className="text-xs text-muted">por {post.author.name ?? post.author.email}</span> : null}
      </div>
      <BlogEditor
        storeHost={decodeURIComponent(domain)}
        categories={categories}
        values={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          categoryId: post.categoryId ?? "",
          excerpt: post.excerpt ?? "",
          content: post.content,
          tags: post.tags.join(", "),
          seoTitle: post.seoTitle ?? "",
          seoDescription: post.seoDescription ?? "",
          coverImageUrl: post.coverImageUrl,
          publish: state === "draft" ? "draft" : state === "scheduled" ? "schedule" : "now",
          publishAt: toCaracasInput(state === "scheduled" && post.publishedAt ? post.publishedAt : tomorrow),
          live: state === "published",
          products: post.products.map((p) => ({ productId: p.product.id, name: p.product.name, imageUrl: p.product.images[0]?.url ?? null, note: p.note ?? "" })),
        }}
      />
    </>
  );
}

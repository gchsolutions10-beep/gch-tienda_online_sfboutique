import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CONTENT_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { BlogEditor } from "@/components/admin/blog-editor";
import { toCaracasInput } from "@/lib/blog";

export const metadata = { title: "Nuevo artículo" };

export default async function NewPostPage({ params }: PageProps<"/t/[domain]/admin/blog/nuevo">) {
  const { domain } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, CONTENT_ROLES, "/admin/blog/nuevo");
  const categories = await tenantDb(tenant.id).blogCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  // Por defecto, programar para mañana a las 9:00 (hora de Venezuela).
  const tomorrow = new Date(new Date().getTime() + 86_400_000);
  const publishAt = `${toCaracasInput(tomorrow).slice(0, 10)}T09:00`;

  return (
    <>
      <Link href="/admin/blog" className="text-sm font-semibold text-muted hover:text-ink">← Blog</Link>
      <h1 className="mb-6 mt-2 font-display text-2xl font-extrabold">Nuevo artículo</h1>
      <BlogEditor
        storeHost={decodeURIComponent(domain)}
        categories={categories}
        values={{
          id: null,
          title: "",
          slug: "",
          categoryId: "",
          excerpt: "",
          content: "",
          tags: "",
          seoTitle: "",
          seoDescription: "",
          coverImageUrl: null,
          publish: "draft",
          publishAt,
          live: false,
          products: [],
        }}
      />
    </>
  );
}

import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { getCatalogOptions } from "@/server/queries/admin-products";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "Nuevo producto" };

export default async function NewProductPage({ params }: PageProps<"/t/[domain]/admin/productos/nuevo">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], "/admin/productos/nuevo");
  const options = await getCatalogOptions(tenant.id);
  return (
    <>
      <Link href="/admin/productos" className="text-sm font-semibold text-muted hover:text-ink">
        ← Productos
      </Link>
      <PageHeader title="Nuevo producto" description="Primero los datos, el precio y el stock por talla y color. Las fotos se suben al crearlo." />
      <ProductForm product={null} variants={[]} {...options} />
    </>
  );
}

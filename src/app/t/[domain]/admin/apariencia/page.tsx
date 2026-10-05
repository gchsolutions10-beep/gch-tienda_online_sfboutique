import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { ThemeForm } from "@/components/admin/theme-form";
import { tenantTheme } from "@/lib/theme";

export const metadata = { title: "Apariencia" };

export default async function AppearancePage({ params }: PageProps<"/t/[domain]/admin/apariencia">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/apariencia");
  if (!isTenantAdmin(ctx)) redirect("/admin");
  return (
    <>
      <PageHeader title="Apariencia" description="Los colores de tu tienda. Parten de la identidad de tu marca y siempre quedan legibles." />
      <div className="max-w-5xl">
        <ThemeForm initial={tenantTheme(tenant)} brand={tenant.primaryColor} name={tenant.name} />
      </div>
    </>
  );
}

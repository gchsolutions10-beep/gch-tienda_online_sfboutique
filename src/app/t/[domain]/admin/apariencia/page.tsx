import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { ThemeForm } from "@/components/admin/theme-form";
import { DomainForm } from "@/components/admin/domain-form";
import { db } from "@/server/db";
import { tenantTheme } from "@/lib/theme";

export const metadata = { title: "Apariencia" };

export default async function AppearancePage({ params }: PageProps<"/t/[domain]/admin/apariencia">) {
  const { domain } = await params;
  const tenant = await getTenant(domain);
  const ctx = await requireAdmin(tenant, "/admin/apariencia");
  if (!isTenantAdmin(ctx)) redirect("/admin");
  const domains = await db.tenantDomain.findMany({ where: { tenantId: tenant.id }, orderBy: { domain: "asc" }, select: { domain: true } });
  return (
    <>
      <PageHeader title="Apariencia" description="Los colores y el dominio de tu tienda. Parten de la identidad de tu marca y siempre quedan legibles." />
      <div className="max-w-5xl space-y-6">
        <ThemeForm initial={tenantTheme(tenant)} brand={tenant.primaryColor} name={tenant.name} />
        <DomainForm domains={domains.map((d) => d.domain)} current={decodeURIComponent(domain)} />
      </div>
    </>
  );
}

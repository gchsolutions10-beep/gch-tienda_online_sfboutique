import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { logout } from "@/server/actions/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { TenantLogo } from "@/components/tenant-logo";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  TENANT_ADMIN: "Administradora",
  BRANCH_ADMIN: "Encargada de tienda",
  SELLER: "Vendedora",
  EDITOR: "Contenido",
};

export default async function AdminLayout({ children, params }: LayoutProps<"/t/[domain]/admin">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant);

  return (
    <div className="min-h-dvh bg-cream text-ink print:block print:bg-white lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-line bg-paper print:hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <Link href="/" className="flex shrink-0 items-center gap-3 px-5 py-4" title="Ver la tienda">
          {tenant.logoUrl ? <TenantLogo src={tenant.logoUrl} alt="" className="size-9" sizes="36px" /> : null}
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold text-brand-strong">{tenant.name}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Administración</p>
          </div>
        </Link>
        <AdminNav owner={isTenantAdmin(ctx)} content={isTenantAdmin(ctx) || ctx.roles.includes("EDITOR")} manager={isTenantAdmin(ctx) || ctx.roles.includes("BRANCH_ADMIN")} />
        <div className="hidden shrink-0 border-t border-line px-5 py-4 lg:block">
          <p className="truncate text-sm font-semibold">{ctx.user.name ?? ctx.user.email}</p>
          <p className="text-xs text-muted">{ctx.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</p>
          <form action={logout} className="mt-2">
            <button className="text-xs font-semibold text-muted hover:text-danger">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 px-4 py-6 sm:px-8 lg:py-8 print:p-0">{children}</div>
    </div>
  );
}

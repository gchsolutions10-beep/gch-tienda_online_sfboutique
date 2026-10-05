import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { getCurrentUser } from "@/server/auth/session";
import { resolveAccess, STAFF_ROLES } from "@/server/auth/guards";
import { safeNextPath } from "@/lib/hosts";
import { TenantLogo } from "@/components/tenant-logo";
import { LoginForm } from "./login-form";
import type { CSSProperties } from "react";
import { tenantThemeStyle } from "@/lib/theme";

export const metadata = { title: "Acceso del personal" };

export default async function LoginPage({ params, searchParams }: PageProps<"/t/[domain]/login">) {
  const tenant = await getTenant((await params).domain);
  const next = safeNextPath((await searchParams).next, "/admin");

  // Si ya tiene sesión válida con acceso, no mostrar el login.
  const user = await getCurrentUser();
  const access = user ? resolveAccess(user, tenant.id, STAFF_ROLES) : null;
  if (access) redirect(next);

  return (
    <main style={tenantThemeStyle(tenant) as CSSProperties} className="flex min-h-dvh items-center justify-center bg-store px-4 py-16 text-store-ink">
      <div className="w-full max-w-md">
        <div className="relative rounded-[2rem] bg-store-card px-6 pb-7 pt-16 shadow-xl sm:px-10">
          {/* Logo de la marca asomándose por el borde superior. */}
          <div className="absolute -top-12 left-1/2 grid size-24 -translate-x-1/2 place-items-center rounded-full border-4 border-store-card bg-brand shadow-lg">
            {tenant.logoUrl ? (
              <TenantLogo src={tenant.logoUrl} alt="" className="size-20" sizes="80px" preload />
            ) : (
              <span aria-hidden className="font-display text-3xl font-bold text-on-brand">
                {tenant.name.charAt(0)}
              </span>
            )}
          </div>
          <Link
            href="/"
            aria-label="Cerrar y volver a la tienda"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-store text-xl text-brand-strong hover:bg-store-line"
          >
            ✕
          </Link>
          <h1 className="text-center font-display text-3xl font-bold text-brand-strong">Inicia sesión</h1>
          <p className="mt-1 text-center text-sm text-store-muted">Acceso del personal de {tenant.name}</p>
          <div className="mt-6">
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}

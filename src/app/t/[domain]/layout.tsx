import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { getTenant } from "@/server/tenant";
import { brandTextOnLight, textOnColor } from "@/lib/color";
import { tenantTheme } from "@/lib/theme";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export async function generateMetadata({ params }: LayoutProps<"/t/[domain]">): Promise<Metadata> {
  const tenant = await getTenant((await params).domain);
  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    description: tenant.tagline ?? undefined,
    // El logo del negocio en la pestaña del navegador y al guardar la página en el celular.
    icons: { icon: tenant.logoUrl ?? "/icono/192", shortcut: tenant.logoUrl ?? "/icono/192", apple: "/icono/180" },
    // App instalable (PWA): manifest con la marca y modo pantalla completa en iPhone.
    manifest: "/manifest",
    appleWebApp: { capable: true, title: tenant.name, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: LayoutProps<"/t/[domain]">): Promise<Viewport> {
  const tenant = await getTenant((await params).domain);
  return { themeColor: tenantTheme(tenant).bar ?? (HEX_COLOR.test(tenant.primaryColor) ? tenant.primaryColor : "#7B2F9E") };
}

/** Aplica la marca del tenant (color principal) a todo su árbol de rutas. */
export default async function TenantLayout({ children, params }: LayoutProps<"/t/[domain]">) {
  const tenant = await getTenant((await params).domain);
  const brand = HEX_COLOR.test(tenant.primaryColor) ? tenant.primaryColor : "#7B2F9E";

  return (
    <div
      style={{ "--brand": brand, "--on-brand": textOnColor(brand), "--brand-fg": brandTextOnLight(brand) } as CSSProperties}
      className="min-h-dvh"
    >
      {children}
    </div>
  );
}

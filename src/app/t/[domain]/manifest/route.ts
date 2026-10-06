import { getTenant } from "@/server/tenant";
import { tenantTheme } from "@/lib/theme";

/**
 * Manifest de la app instalable de cada negocio (nombre, colores e íconos de su
 * marca). Android arma la pantalla de bienvenida con el nombre, el ícono y el
 * color de fondo.
 */
export async function GET(_request: Request, { params }: RouteContext<"/t/[domain]/manifest">) {
  const tenant = await getTenant((await params).domain);
  const theme = tenantTheme(tenant);
  const brand = /^#[0-9a-f]{6}$/i.test(tenant.primaryColor) ? tenant.primaryColor : "#7B2F9E";
  const manifest = {
    id: "/",
    name: tenant.name,
    short_name: tenant.name.length > 12 ? tenant.name.split(/\s+/).slice(0, 2).join(" ").slice(0, 12) : tenant.name,
    description: tenant.tagline ?? `Tienda en línea de ${tenant.name}`,
    lang: "es-VE",
    start_url: "/?app=1",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: theme.background,
    theme_color: theme.bar ?? brand,
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icono/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mi cuenta y cuotas", url: "/mi-cuenta", icons: [{ src: "/icono/96", sizes: "96x96" }] },
      { name: "Novedades", url: "/catalogo?orden=nuevos", icons: [{ src: "/icono/96", sizes: "96x96" }] },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

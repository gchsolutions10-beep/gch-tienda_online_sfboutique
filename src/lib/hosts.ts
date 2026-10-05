export type HostMatch =
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; domain: string }
  | { kind: "root" };

/** Quita el puerto y normaliza a minúsculas. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * Clasifica el host de la petición.
 *  - `sabrosito.localhost`, `sabrosito.<ROOT_DOMAIN>` → subdominio del tenant
 *  - `localhost`, `<ROOT_DOMAIN>`, `www.<ROOT_DOMAIN>`, `*.vercel.app` → raíz de la plataforma
 *  - cualquier otro → dominio propio del tenant (tabla TenantDomain)
 */
export function parseHost(rawHost: string, rootDomain: string): HostMatch {
  const host = normalizeHost(rawHost);
  const root = normalizeHost(rootDomain);

  if (host === root || host === `www.${root}` || host === "localhost" || host === "127.0.0.1") {
    return { kind: "root" };
  }
  // Despliegues de preview en Vercel: se tratan como raíz (tenant por defecto).
  if (host.endsWith(".vercel.app")) return { kind: "root" };

  for (const base of [root, "localhost"]) {
    const suffix = `.${base}`;
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      // Solo un nivel de subdominio: "sabrosito", no "a.b".
      if (/^[a-z0-9-]+$/.test(sub) && sub !== "www") return { kind: "subdomain", slug: sub };
    }
  }

  return { kind: "custom", domain: host };
}

/** Rutas de la tienda que no pueden usarse como slug de sucursal. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "app",
  "api",
  "login",
  "logout",
  "pedido",
  "pago",
  "checkout",
  "sin-acceso",
  "platform",
]);

/** Valida que `next` sea una ruta interna (evita redirecciones abiertas). */
export function safeNextPath(next: unknown, fallback = "/admin"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

/**
 * Dirección pública de la tienda: su dominio propio; si no tiene, el negocio
 * por defecto vive en el dominio raíz (p. ej. <proyecto>.vercel.app) y los
 * demás en `<slug>.<ROOT_DOMAIN>`.
 */
export function publicOrigin(domain: string | null, slug: string) {
  const root = process.env.ROOT_DOMAIN;
  const host = domain ?? (root ? (slug === process.env.DEFAULT_TENANT_SLUG ? root : `${slug}.${root}`) : null);
  if (!host) return "";
  return `${/localhost|\.test(:|$)/.test(host) ? "http" : "https"}://${host}`;
}

/**
 * Valida un dominio propio escrito por la dueña ("https://www.SFBoutique.com/"
 * → "www.sfboutique.com"). Rechaza localhost, IPs y los dominios de la plataforma.
 */
export function parseCustomDomain(input: string, rootDomain = ""): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (host.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return null;
  const root = normalizeHost(rootDomain);
  if (host.endsWith(".vercel.app") || host === "localhost" || host.endsWith(".localhost")) return null;
  if (root && (host === root || host.endsWith(`.${root}`))) return null;
  return host;
}

/** El dominio y su pareja con/sin www (los dos deben llevar a la tienda). */
export function domainPair(host: string): string[] {
  return host.startsWith("www.") ? [host.slice(4), host] : [host, `www.${host}`];
}

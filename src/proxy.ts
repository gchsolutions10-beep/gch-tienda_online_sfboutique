import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/cookie-name";

/**
 * Multi-tenant por host: toda petición se reescribe internamente a
 * `/t/<host>/<ruta>`, y `src/app/t/[domain]/layout.tsx` resuelve el tenant.
 * Ej.: sabrosito.localhost:3000/admin  →  /t/sabrosito.localhost%3A3000/admin
 *
 * Una petición directa a `/t/...` también se prefija, así que termina en 404:
 * nadie puede elegir otro tenant escribiendo la ruta interna.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;

  // Chequeo optimista: sin cookie no hay sesión posible en las áreas privadas.
  // La verificación real (sesión válida + rol) ocurre en los layouts y acciones.
  const isPrivate = /^\/(admin|app|cuenta|ayuda)(\/|$)/.test(pathname);
  if (isPrivate && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/t/${encodeURIComponent(host)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Excluye API, assets de Next y archivos estáticos (cualquier ruta con extensión).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};

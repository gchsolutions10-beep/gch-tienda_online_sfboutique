@AGENTS.md

# GCH Moda — notas para trabajar en este repositorio

Tienda online + gestión + CRM + blog para boutiques de moda en Venezuela (GchSolutions). Primer negocio: **SF Boutique**
(Acarigua, @sf_boutiqueve). En línea: https://sfboutique.vercel.app (Vercel, rama `main`) con base de datos en Neon.

## Con quién trabajas
- El usuario (Gustavo, GchSolutions) **habla en español**: responde siempre en español, claro y sin tecnicismos
  innecesarios (explica rama, merge, migración, etc. cuando aparezcan). No es programador de formación.
- Trabaja **por fases**; dentro de una fase puedes avanzar solo. Al terminar: pruebas, tipos, lint y build en verde,
  commit en una rama `fase-N-…`, unir a `main` cuando lo pida, y explicar qué se hizo y qué falta.

## Estado (6 de octubre de 2026)
- Fases 1–7 listas: catálogo con variantes talla × color, checkout con reserva de stock y reporte de pago, pedidos,
  productos/stock, envíos, cuentas de cobro, caja multimoneda con cierre, CRM, **facturación venezolana con IGTF**
  (facturas, notas de crédito/débito, número de control, libro de ventas), **editor del blog, portada y banners**, y
  **reportes de gestión** (ventas, márgenes, BCV vs P2P, inventario) con **dominio propio**, y **Credi-SF** (crédito con
  fiador, niveles, cobranza y mora) con cuentas de clientas, **PWA instalable y avisos push**, y **módulos encendibles** con **Importaciones por encargo** (lotes, cotizador con
  adelanto, galería grupal, reseñas). Detalle en `docs/ARQUITECTURA.md` (secciones 5c a 5f).
- Credi-SF necesita en Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `CRON_SECRET`
  (guía en `docs/DESPLIEGUE.md` §7). El contrato y el recargo por mora: «validar con un abogado».
- Siguiente: lo que pida el usuario tras mostrar la demo (p. ej. imprenta digital conectada, nota de entrega).
- Lo legal/fiscal (IVA, IGTF, número de control) se marca siempre «validar con el contador»; el sistema no sustituye a la
  imprenta digital: guarda el número de control que ella asigna.

## Reglas del código
- Next.js 16 (ver AGENTS.md: `proxy.ts`, params asíncronos, `PageProps`/`RouteContext` vía `npx next typegen`), React 19,
  Tailwind 4, Prisma 7 con `@prisma/adapter-pg`, Zod, Vitest.
- Multi-negocio: todo pasa por `tenantDb(tenantId)` (`src/server/db.ts`). El cliente `db` se crea en la primera consulta
  (así compila sin `DATABASE_URL`).
- Dinero en **centavos enteros**; precios del catálogo en USD; el bolívar es la moneda de cuenta (tasa BCV guardada por
  pedido y pago); P2P solo para gestión. Lógica pura y probada en `src/lib`, datos en `src/server`.
- Constantes que usan páginas de servidor no van en archivos `"use client"` (ponlas en `src/lib`).
- En componentes de servidor no uses `Date.now()` (regla react-hooks/purity): usa `new Date().getTime()`.

## Base de datos y publicación
- **Nunca te conectes a Neon ni pidas sus cadenas de conexión.** El usuario corre: `npm run migrar:neon` (aplica
  migraciones), `npm run admin:neon` (clave/administradora), `npm run demo:neon` (recarga la demo: BORRA datos; solo para
  demos). Guía: `docs/DESPLIEGUE.md`.
- **Migraciones al publicar:** el `build` corre `scripts/migrar-en-vercel.mjs`, que en Vercel *Production* aplica
  `prisma migrate deploy` con `DIRECT_DATABASE_URL` (cadena Direct de Neon; solo en Production). Si falla, la
  publicación se detiene y sigue la versión anterior. Si la variable falta, solo avisa: entonces el usuario corre
  `npm run migrar:neon` antes del `git push` (respaldo). Las migraciones deben ser aditivas/compatibles con la
  versión anterior. Avisa al usuario cuando una fase traiga migración y revisa con él el registro de Vercel.
- Vercel: variables `DATABASE_URL` (Neon pooled), `ROOT_DOMAIN=sfboutique.vercel.app`, `DEFAULT_TENANT_SLUG=sfboutique`.
  `vercel.json` fuerza el framework Next.js (Vercel lo había detectado como estático).
- Local (en la computadora del usuario, Windows): `npm run db:local` (prisma dev en puertos fijos 51217–51219; si dice
  «puerto ocupado» es que ya está encendida) y `npm run dev -- --port 3001` → `http://sfboutique.localhost:3001`.
  Sabrosito (otro proyecto) usa los puertos 51213–51216.
- En una sesión en la nube: verifica con `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`. Además,
  `npx prisma dev` funciona en la nube (base temporal en el puerto 51214): `prisma migrate deploy`, el seed con
  `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` y `npx tsx tests/integration/facturacion.ts` para probar de punta a punta.

## Detalles que ya costaron tiempo
- Al agregar rutas nuevas con el servidor de desarrollo corriendo pueden dar 404: borra `.next/dev` y reinicia.
- En Windows el repo usa `core.autocrlf=true`: los archivos tienen CRLF; reemplazos de varias líneas con scripts fallan
  en silencio (usa la herramienta de edición).
- Formularios con `action={fn}` se vacían tras un error: usa `onSubmit` + `preventDefault` y `method="post"`.
- Cédula/RIF: `parseVeId` / `formatVeId`; teléfonos `normalizeVePhone` (+58).
- Dentro de `$transaction` no consultes con `tenantDb()`/`db` (otra conexión): pasa el `tx` (ej. `getCreditSettings(id, tx)`);
  con una sola conexión la transacción se traba hasta el timeout.
- Archivos `"use server"` solo pueden exportar funciones async (ni constantes ni tipos de valor).
- La base local de `prisma dev` (pglite) acepta mal varias conexiones a la vez: si `next start` da «Server has closed the
  connection», no corras `tsx` contra la base con el servidor encendido; si persiste, `npx prisma dev stop moda`,
  `npx prisma dev rm moda`, vuelve a crearla, `migrate deploy` y seed. En Neon no pasa.

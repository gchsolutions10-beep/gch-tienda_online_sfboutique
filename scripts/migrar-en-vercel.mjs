/**
 * Aplica las migraciones pendientes a la base de datos de PRODUCCIÓN durante la
 * publicación en Vercel (script "vercel-build"), antes de compilar.
 *
 * - Solo en producción (VERCEL_ENV=production). Las vistas previas de otras
 *   ramas nunca tocan la base.
 * - Usa DIRECT_DATABASE_URL: la cadena **Direct** de Neon (sin "-pooler"). Las
 *   migraciones no deben ir por el pooler.
 * - Si la migración falla, la publicación se detiene y sigue en línea la
 *   versión anterior (la página no se cae).
 * - Si falta DIRECT_DATABASE_URL, avisa y sigue sin migrar (como antes:
 *   `npm run migrar:neon` desde la computadora sigue funcionando).
 */
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migraciones] Entorno «${process.env.VERCEL_ENV ?? "local"}»: no se migra (solo en producción).`);
  process.exit(0);
}

const direct = process.env.DIRECT_DATABASE_URL?.trim();
if (!direct) {
  console.warn(
    "[migraciones] ⚠ Falta DIRECT_DATABASE_URL en Vercel: no se aplicaron migraciones.\n" +
      "              Agrega la cadena Direct de Neon (ver docs/DESPLIEGUE.md) o corre «npm run migrar:neon».",
  );
  process.exit(0);
}
if (direct.includes("-pooler")) {
  console.error("[migraciones] ✖ DIRECT_DATABASE_URL tiene «-pooler»: usa la cadena Direct de Neon (sin pooler).");
  process.exit(1);
}

console.log("[migraciones] Aplicando migraciones pendientes a la base de producción…");
const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: direct },
  shell: process.platform === "win32",
});
if (run.status !== 0) {
  console.error("[migraciones] ✖ La migración falló: se detiene la publicación y sigue en línea la versión anterior.");
  process.exit(run.status ?? 1);
}
console.log("[migraciones] ✓ Base de datos al día.");

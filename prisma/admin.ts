/**
 * Crea o corrige la administradora del negocio SIN borrar nada más:
 *
 *   npm run db:admin                         → crea/actualiza SEED_ADMIN_EMAIL con SEED_ADMIN_PASSWORD
 *   npm run db:admin -- --remove viejo@x.com → además elimina ese usuario (p. ej. uno creado por error)
 *
 * El negocio es DEFAULT_TENANT_SLUG (o "sfboutique"). Útil en producción
 * (Neon) cuando el seed ya se corrió.
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { adminPasswordProblem } from "./admin-utils";

async function main() {
  const slug = process.env.DEFAULT_TENANT_SLUG || "sfboutique";
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("SEED_ADMIN_EMAIL debe ser un correo válido");
  const problem = adminPasswordProblem(password);
  if (problem) throw new Error(problem);

  const tenant = await db.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`No existe el negocio "${slug}". Carga primero la demostración: npm run demo:neon`);

  const admin = await db.user.upsert({
    where: { email },
    update: { passwordHash: await hashPassword(password!) },
    create: { email, name: `Administración ${tenant.name}`, passwordHash: await hashPassword(password!) },
    select: { id: true },
  });
  const membership = await db.membership.findFirst({ where: { userId: admin.id, tenantId: tenant.id, role: "TENANT_ADMIN" } });
  if (!membership) await db.membership.create({ data: { userId: admin.id, tenantId: tenant.id, role: "TENANT_ADMIN" } });
  // Cierra sesiones abiertas con la clave anterior.
  await db.session.deleteMany({ where: { userId: admin.id } });
  console.log(`✓ Administradora de "${tenant.name}": ${email}`);

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--remove") continue;
    const target = args[i + 1]?.trim().toLowerCase();
    if (!target || target === email) continue;
    const user = await db.user.findUnique({ where: { email: target }, select: { id: true, isSuperAdmin: true } });
    if (!user) console.log(`  (no existe ${target})`);
    else if (user.isSuperAdmin) console.log(`  (no se elimina ${target}: es super administrador)`);
    else {
      await db.user.delete({ where: { id: user.id } });
      console.log(`✓ Eliminado: ${target}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

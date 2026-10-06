import { cache } from "react";
import { tenantDb } from "@/server/db";

/**
 * Módulos que la dueña prende o apaga en Administración > Módulos.
 * Apagado = sin enlaces en el menú ni el pie, rutas con «no disponible» y sin
 * opciones en el checkout. Memoizado por petición.
 */
export const getModules = cache(async (tenantId: string) => {
  const s = await tenantDb(tenantId).tenantSettings.findFirst({ select: { importsEnabled: true, creditEnabled: true } });
  return { imports: s?.importsEnabled ?? false, credit: s?.creditEnabled ?? false };
});

export type Modules = Awaited<ReturnType<typeof getModules>>;


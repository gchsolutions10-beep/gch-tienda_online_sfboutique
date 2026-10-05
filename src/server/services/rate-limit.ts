import { headers } from "next/headers";
import { db } from "@/server/db";
import { clientIpFrom } from "@/lib/rate-limit";

/**
 * Límites por acción. Ventana fija: `limit` intentos cada `windowSec`.
 * Pensados para frenar fuerza bruta y spam sin molestar a un cliente normal.
 */
export const RATE_LIMITS = {
  /** Por IP: muchos correos distintos desde el mismo equipo. */
  loginIp: { limit: 30, windowSec: 15 * 60 },
  /** Por cuenta: protege una contraseña aunque el ataque cambie de IP. */
  loginAccount: { limit: 8, windowSec: 15 * 60 },
  /** Consultar un pedido por número + teléfono. */
  orderLookup: { limit: 10, windowSec: 10 * 60 },
  /** Confirmar pedidos (evita pedidos falsos en ráfaga). */
  checkout: { limit: 15, windowSec: 10 * 60 },
  /** Cancelar o modificar desde el seguimiento, y subir comprobantes. */
  customerAction: { limit: 20, windowSec: 10 * 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Suma un intento y dice si todavía está dentro del límite (atómico en la BD). */
export async function hit(name: RateLimitName, id: string): Promise<RateLimitResult> {
  const { limit, windowSec } = RATE_LIMITS[name];
  const key = `${name}:${id}`.slice(0, 300);
  const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO rate_limits (key, count, "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."resetAt" <= now() THEN 1 ELSE rate_limits.count + 1 END,
      "resetAt" = CASE WHEN rate_limits."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE rate_limits."resetAt" END
    RETURNING count, "resetAt"`;
  if (row.count <= limit) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
}

/** Borra el contador (p. ej. tras un login correcto). */
export async function resetLimit(name: RateLimitName, id: string) {
  await db.rateLimit.deleteMany({ where: { key: `${name}:${id}`.slice(0, 300) } });
}

/** IP del visitante según los encabezados del proxy (Vercel). */
export async function clientIp() {
  return clientIpFrom(await headers());
}

export function tooManyMessage(retryAfterSec: number) {
  const minutes = Math.ceil(retryAfterSec / 60);
  return `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? "minuto" : "minutos"} y vuelve a intentarlo.`;
}
